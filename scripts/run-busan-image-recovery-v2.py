#!/usr/bin/env python3
"""
TASK-BUSAN-IMAGE-RECOVERY-V2
EN_V6 image_gate 차단 37건에 대해 VisitBusan 공식 페이지 이미지 복구 및 EN_V7 생성.

외부 요청:
  - robots.txt: 1회
  - VisitBusan food pages: 37회
검색: 이번 실행에서 HOMEPAGE_URL 공백 전원 → OFFICIAL_SITE_NOT_FOUND 처리

금지: push, git add -A, candidate 삭제, 새 review_flag, 기존 publishability SHA 변경
"""

import csv, hashlib, io, json, re, subprocess, sys, time, urllib.error, urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TASK_ID      = "TASK-BUSAN-IMAGE-RECOVERY-V2"
GATE_VERSION = "BUSAN_PUBLISHABILITY_EN_V7"
run_ts       = datetime.now(timezone.utc).isoformat()

BASE         = Path(".")
EC_FILE      = BASE / "data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl"
REPORT_DIR   = BASE / "data/tourapi/reports/busan"
ENV6_DETAILS = REPORT_DIR / "busan-publishability-en-v6-details.jsonl"
ENV7_SUMMARY = REPORT_DIR / "busan-publishability-en-v7.json"
ENV7_DETAILS = REPORT_DIR / "busan-publishability-en-v7-details.jsonl"
EVIDENCE     = REPORT_DIR / "busan-image-recovery-v2-evidence.json"
COMPLETION   = REPORT_DIR / "busan-image-recovery-v2-completion-report.json"

LINKAGE_REF  = "origin/integration/busan-linkage-index-20260727"
LINKAGE_PATH = "data/tourapi/reports/busan/busan-linkage-index-21r.csv"

ROBOTS_URL   = "https://www.visitbusan.net/robots.txt"
VB_FOOD_URL  = "https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201002001000&uc_seq={uc_seq}&lang_cd=ko"
DELAY        = 1.5
TIMEOUT      = 15

# 37 targets (31 legacy + 6 new V6 canonicals from adjudication)
TARGET_CIDS = {
    'busan-F-00251','busan-F-00253','busan-F-00255','busan-F-00256','busan-F-00259',
    'busan-F-00260','busan-F-00262','busan-F-00264','busan-F-00269','busan-F-00273',
    'busan-F-00275','busan-F-00278','busan-F-00279','busan-F-00281','busan-F-00282',
    'busan-F-00285','busan-F-00288','busan-F-00289','busan-F-00290','busan-F-00292',
    'busan-F-00297','busan-F-00305','busan-F-00307','busan-F-00309','busan-F-00310',
    'busan-F-00315','busan-F-00317','busan-F-00318','busan-F-00326','busan-F-00328',
    'busan-F-00333','busan-F-00336','busan-F-00338','busan-F-00342','busan-F-00344',
    'busan-F-00349','busan-F-00350',
}

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
    "v6d": ENV6_DETAILS,
}

BUSAN_LAT_MIN, BUSAN_LAT_MAX = 34.88, 35.39
BUSAN_LNG_MIN, BUSAN_LNG_MAX = 128.74, 129.31
FRESHNESS_FLAGS = frozenset({"needs_hours", "needs_arrival_verification", "needs_map_name_ko"})
CORE_GATES_EN = [
    "identity_gate", "name_ko_gate", "name_en_gate", "address_gate",
    "coordinate_gate", "branch_gate", "description_en_gate", "image_gate",
    "provenance_gate",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

request_count = 0


# ── helpers ─────────────────────────────────────────────────────────────────

def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def fetch(url: str) -> tuple:
    global request_count
    request_count += 1
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            enc = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(enc, errors="replace"), resp.status, None
    except urllib.error.HTTPError as e:
        return None, e.code, str(e)
    except urllib.error.URLError as e:
        return None, 0, str(e)
    except Exception as e:
        return None, 0, str(e)


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og = {}
        self._in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            prop = a.get("property", "") or a.get("name", "")
            val  = a.get("content", "")
            if prop.startswith("og:"):
                self.og[prop[3:]] = val

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def parse_og(html: str) -> dict:
    p = MetaParser()
    try:
        p.feed(html or "")
    except Exception:
        pass
    return {
        "title": (p.og.get("title") or p.title or "").strip(),
        "og_image": (p.og.get("image") or "").strip(),
        "og_desc":  (p.og.get("description") or "").strip(),
    }


def name_matches(page_title: str, restaurant_name: str) -> bool:
    """Check if page title contains the restaurant name (loose match)."""
    if not page_title or not restaurant_name:
        return False
    pn = re.sub(r'\s+', '', page_title.lower())
    rn = re.sub(r'\s+', '', restaurant_name.lower())
    return rn in pn or pn in rn or (len(rn) > 2 and rn[:4] in pn)


def is_valid_image_url(url: str) -> bool:
    """Check if URL looks like a real image (not logo/banner by pattern)."""
    if not url:
        return False
    if not url.startswith("http"):
        return False
    # VisitBusan uploadImgs are content images, not logos
    # Reject if clearly a logo/icon pattern
    low = url.lower()
    if any(x in low for x in ["/logo", "/icon", "/banner", "/btn_", "/bg_"]):
        return False
    return True


def check_image_accessible(url: str) -> tuple:
    """HEAD request to verify image URL is accessible."""
    global request_count
    request_count += 1
    try:
        req = urllib.request.Request(url, method="HEAD", headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            ct = resp.headers.get_content_type() or ""
            return resp.status == 200 and "image" in ct, resp.status, ct
    except Exception as e:
        return False, 0, str(e)


# ── gate functions (same as V6) ─────────────────────────────────────────────

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
    ss   = r.get("source_summary", {})
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
    g["name_en_gate"] = (
        "PASS" if "needs_translation" not in eff_flags
        else "PENDING_SOURCE"
    )
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
        g["branch_gate"] = (
            "FAIL" if "needs_restaurant_branch" in eff_flags else "PASS"
        )
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
        if v == "FAIL":         fail.append(gk)
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


# ── robots.txt ───────────────────────────────────────────────────────────────

def check_robots() -> dict:
    print("[robots.txt] Checking …")
    html, status, err = fetch(ROBOTS_URL)
    if err or not html:
        return {"accessible": False, "status": status, "error": err, "target_blocked": None}
    lines = html.splitlines()
    disallowed = [l.split(":", 1)[1].strip() for l in lines
                  if l.lower().startswith("disallow:")]
    target_blocked = "/" in disallowed
    result = {
        "accessible": True, "status": status,
        "disallowed_count": len(disallowed),
        "target_blocked": target_blocked,
        "sample_disallowed": disallowed[:10],
    }
    print(f"  status={status}, disallowed_count={len(disallowed)}, target_blocked={target_blocked}")
    return result


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print(f"TASK: {TASK_ID}")
    print(f"gate: {GATE_VERSION}")
    print(f"run_ts: {run_ts}")
    print("=" * 65)

    # ── SHA check: protected files ───────────────────────────────────────────
    print("\n[protected SHA check]")
    pre_shas = {}
    for k, p in PROTECTED.items():
        if p.exists():
            pre_shas[k] = sha256_file(p)
            print(f"  {k}: {pre_shas[k][:16]} OK")
        else:
            print(f"  {k}: MISSING — abort")
            sys.exit(1)

    # ── Load enriched candidates ─────────────────────────────────────────────
    print("\n[load] Enriched candidates …")
    all_candidates: list[dict] = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line:
                all_candidates.append(json.loads(line))
    if len(all_candidates) != 1642:
        print(f"ABORT: expected 1642 candidates, got {len(all_candidates)}")
        sys.exit(1)
    print(f"  {len(all_candidates)} candidates loaded")

    # Index targets
    targets = {r["candidate_id"]: r for r in all_candidates if r["candidate_id"] in TARGET_CIDS}
    if len(targets) != 37:
        print(f"ABORT: expected 37 targets, found {len(targets)}")
        sys.exit(1)
    print(f"  37 targets confirmed")

    # ── Pre-condition check ─────────────────────────────────────────────────
    print("\n[pre-condition] Verifying source_exhausted state …")
    pre_check_ok = True
    for cid, r in targets.items():
        ia = r.get("image_assessment", {})
        curated = ia.get("curated_images", [])
        status  = ia.get("image_status", "")
        if curated or status != "source_exhausted":
            print(f"  UNEXPECTED STATE: {cid} curated={curated} status={status}")
            pre_check_ok = False
    if pre_check_ok:
        print("  All 37: curated_images=[], image_status=source_exhausted ✓")
    else:
        print("ABORT: pre-condition failed — state has changed since analysis")
        sys.exit(1)

    # ── Load linkage index (UC_SEQ extraction) ────────────────────────────────
    print("\n[linkage] Loading linkage index …")
    raw = subprocess.check_output(
        ["git", "show", f"{LINKAGE_REF}:{LINKAGE_PATH}"],
        stderr=subprocess.DEVNULL,
    )
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    linkage = {row["candidate_id"]: row for row in reader}

    # Confirm URL pattern from other visitbusan_web entries
    vb_url_samples = [
        row["source_url"]
        for row in linkage.values()
        if row.get("primary_source_type") == "visitbusan_web"
        and row.get("source_url")
        and "menuCd=DOM_000000201002001000" in row.get("source_url", "")
    ]
    print(f"  VB food URL pattern confirmed from {len(vb_url_samples)} linkage entries")
    if vb_url_samples:
        print(f"  Sample: {vb_url_samples[0]}")

    # Get UC_SEQ for each target from enriched source_keys
    uc_seq_map = {}
    for cid, r in targets.items():
        sk_list = r.get("source_summary", {}).get("source_keys", [])
        for sk in sk_list:
            if sk.startswith("FoodService:"):
                uc_seq_map[cid] = sk.split(":")[1]
                break
    print(f"  UC_SEQ resolved for {len(uc_seq_map)}/37 targets")
    missing_uc = TARGET_CIDS - set(uc_seq_map.keys())
    if missing_uc:
        print(f"  WARNING: No UC_SEQ for: {missing_uc}")

    # ── robots.txt check ─────────────────────────────────────────────────────
    print()
    robots = check_robots()
    time.sleep(DELAY)
    if robots.get("target_blocked"):
        print("ABORT: robots.txt disallows target paths")
        sys.exit(1)

    # ── VisitBusan food page checks ───────────────────────────────────────────
    print(f"\n[VB pages] Fetching {len(uc_seq_map)} VisitBusan food pages …")
    vb_results = {}

    for idx, (cid, uc_seq) in enumerate(sorted(uc_seq_map.items()), 1):
        title_ko = targets[cid].get("title_ko", "")
        vb_url   = VB_FOOD_URL.format(uc_seq=uc_seq)
        print(f"  [{idx:02d}/37] {cid} [{title_ko}] UC_SEQ={uc_seq} …", end=" ", flush=True)

        html, status, err = fetch(vb_url)
        time.sleep(DELAY)

        if err or not html:
            print(f"HTTP {status} ERR={err}")
            vb_results[cid] = {
                "url": vb_url, "status": status, "error": err,
                "verdict": "FETCH_FAILED",
                "og_image": None, "page_title": None, "name_match": None,
            }
            continue

        meta  = parse_og(html)
        title = meta["title"]
        img   = meta["og_image"]

        matched = name_matches(title, title_ko)
        has_img = bool(img) and is_valid_image_url(img)

        if status == 404 or (not title and not img):
            verdict = "OFFICIAL_SITE_NOT_FOUND"
        elif not matched and title:
            verdict = "WRONG_PLACE"
        elif matched and has_img:
            verdict = "IMAGE_CANDIDATE"
        elif matched and not has_img:
            verdict = "OFFICIAL_PAGE_NO_IMAGE"
        else:
            verdict = "OFFICIAL_PAGE_NO_IMAGE"

        print(f"HTTP {status} title='{title[:30]}' match={matched} img={bool(img)} → {verdict}")

        vb_results[cid] = {
            "url":        vb_url,
            "status":     status,
            "page_title": title,
            "og_image":   img,
            "og_desc":    meta["og_desc"][:200] if meta["og_desc"] else None,
            "name_match": matched,
            "verdict":    verdict,
        }

    # ── Image accessibility check for candidates ─────────────────────────────
    print(f"\n[img-check] Verifying candidate image URLs …")
    image_candidates = {
        cid: vb_results[cid]
        for cid in vb_results
        if vb_results[cid]["verdict"] == "IMAGE_CANDIDATE"
    }
    print(f"  IMAGE_CANDIDATE count: {len(image_candidates)}")

    verified_images = {}
    for cid, res in image_candidates.items():
        img_url = res["og_image"]
        title_ko = targets[cid].get("title_ko", "")
        accessible, http_code, ct = check_image_accessible(img_url)
        time.sleep(0.5)
        if accessible:
            print(f"  ✓ {cid} [{title_ko}]: {img_url[:80]} (HTTP {http_code}, {ct})")
            verified_images[cid] = {
                "url": img_url,
                "source_page": res["url"],
                "page_title":  res["page_title"],
                "http_code":   http_code,
                "content_type": ct,
            }
        else:
            print(f"  ✗ {cid} [{title_ko}]: INACCESSIBLE HTTP {http_code}")
            vb_results[cid]["verdict"] = "IMAGE_URL_INACCESSIBLE"

    # ── Final verdict assignment ──────────────────────────────────────────────
    print(f"\n[verdict] Assigning final verdicts for all 37 …")
    verdicts = {}
    for cid in sorted(TARGET_CIDS):
        if cid in verified_images:
            verdicts[cid] = "IMAGE_VERIFIED"
        elif cid in vb_results:
            verdicts[cid] = vb_results[cid]["verdict"]
        else:
            verdicts[cid] = "OFFICIAL_SITE_NOT_FOUND"

    # Remaining targets without VB result (no UC_SEQ)
    for cid in missing_uc:
        verdicts[cid] = "OFFICIAL_SITE_NOT_FOUND"

    verdict_dist = Counter(verdicts.values())
    print(f"  Distribution: {dict(verdict_dist)}")

    # ── Apply IMAGE_VERIFIED to enriched candidates ────────────────────────────
    print(f"\n[apply] Applying IMAGE_VERIFIED to enriched candidates …")
    applied_count = 0
    modified_cids = []

    updated_candidates = []
    for r in all_candidates:
        cid = r["candidate_id"]
        if cid not in verified_images or verdicts.get(cid) != "IMAGE_VERIFIED":
            updated_candidates.append(r)
            continue

        img_info = verified_images[cid]
        title_ko = r.get("title_ko", "")

        # Build curated image entry
        new_img = {
            "url":        img_info["url"],
            "source":     "visitbusan_food_page",
            "source_url": img_info["source_page"],
            "rights":     "operational_assumed",
            "rights_note": "VisitBusan 공식 음식 페이지 대표 이미지. 관광 홍보 목적 운영 허용 가정.",
            "provenance":  f"TASK-BUSAN-IMAGE-RECOVERY-V2/{run_ts}",
        }

        ia = r.get("image_assessment", {})
        existing = ia.get("curated_images", [])

        # Duplicate check: do not add if URL already exists
        if any(e.get("url") == new_img["url"] for e in existing):
            print(f"  SKIP {cid}: duplicate URL")
            updated_candidates.append(r)
            continue

        # Append image
        new_curated = existing + [new_img]
        r["image_assessment"]["curated_images"] = new_curated
        r["image_assessment"]["curated_count"]  = len(new_curated)
        r["image_assessment"]["image_status"]   = "image_partial"
        r["image_assessment"]["rights_status"]  = "operational_assumed"

        # Remove needs_image from review_flags
        flags = r.get("validation", {}).get("review_flags", [])
        if "needs_image" in flags:
            r["validation"]["review_flags"] = [f for f in flags if f != "needs_image"]

        updated_candidates.append(r)
        applied_count += 1
        modified_cids.append(cid)
        print(f"  APPLIED: {cid} [{title_ko}]")

    print(f"  Applied: {applied_count} candidates modified")

    # ── Write updated enriched candidates ────────────────────────────────────
    if applied_count > 0:
        print(f"\n[write] Updating enriched candidates file …")
        with open(EC_FILE, "w", encoding="utf-8") as f:
            for r in updated_candidates:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        # Verify count
        count_check = sum(1 for line in open(EC_FILE, encoding="utf-8") if line.strip())
        if count_check != 1642:
            print(f"ABORT: after write, candidate count={count_check} (expected 1642)")
            sys.exit(1)
        print(f"  Wrote {count_check} records ✓")
    else:
        print(f"\n[write] No IMAGE_VERIFIED results — enriched candidates unchanged")

    # ── EN_V7 publishability ──────────────────────────────────────────────────
    print(f"\n[EN_V7] Computing publishability …")

    # Reload from file to get updated data
    v7_candidates = []
    with open(EC_FILE, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line:
                v7_candidates.append(json.loads(line))

    v6_status_map = {}
    with open(ENV6_DETAILS, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rec = json.loads(line)
                v6_status_map[rec["candidate_id"]] = rec["publishability_en_v6"]

    dist = Counter()
    v7_detail_lines = []
    changed = []

    for r in v7_candidates:
        cid      = r["candidate_id"]
        eff      = get_effective_flags(r)
        gates    = evaluate_en_gates(r, eff)
        status, block = determine_publishability(gates, eff)
        dist[status] += 1

        v6_st = v6_status_map.get(cid, "unknown")
        if status != v6_st:
            changed.append({"candidate_id": cid, "v6": v6_st, "v7": status, "block": block})

        detail = {
            "candidate_id":       cid,
            "category":           r.get("category", ""),
            "publishability_en_v7": status,
            "block_reasons":      block,
            "gate_version":       GATE_VERSION,
            "identity_gate":      gates.get("identity_gate"),
            "branch_gate":        gates.get("branch_gate"),
            "description_en_gate": gates.get("description_en_gate"),
            "name_en_gate":       gates.get("name_en_gate"),
            "image_gate":         gates.get("image_gate"),
            "validation_status":  r.get("validation", {}).get("validation_status", ""),
        }
        v7_detail_lines.append(detail)

    ENV7_DETAILS.write_text(
        "\n".join(json.dumps(d, ensure_ascii=False) for d in v7_detail_lines) + "\n",
        encoding="utf-8",
    )

    delta = {k: dist[k] - Counter(v6_status_map.values())[k]
             for k in ("publishable", "publishable_with_caveat", "pending_source", "pending_review")}
    change_types = Counter(f"{c['v6']}→{c['v7']}" for c in changed)

    v7_summary = {
        "report_id":             "busan-publishability-en-v7",
        "gate_version":          GATE_VERSION,
        "task":                  TASK_ID,
        "run_ts":                run_ts,
        "branch":                subprocess.check_output(["git", "branch", "--show-current"], text=True).strip(),
        "total_candidates":      len(v7_candidates),
        "publishability_distribution": dict(dist),
        "env6_distribution":     dict(Counter(v6_status_map.values())),
        "delta_vs_env6":         delta,
        "status_changed_count":  len(changed),
        "change_types":          dict(change_types),
    }
    ENV7_SUMMARY.write_text(json.dumps(v7_summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  EN_V7 distribution: {dict(dist)}")
    print(f"  Changed from V6: {len(changed)}")

    # ── Evidence report ───────────────────────────────────────────────────────
    evidence = {
        "report_id":         "busan-image-recovery-v2-evidence",
        "task":              TASK_ID,
        "run_ts":            run_ts,
        "total_external_requests": request_count,
        "robots_check":      robots,
        "vb_food_url_pattern": VB_FOOD_URL,
        "targets":           sorted(TARGET_CIDS),
        "uc_seq_map":        uc_seq_map,
        "vb_page_results":   vb_results,
        "verified_images":   verified_images,
        "final_verdicts":    {cid: verdicts[cid] for cid in sorted(TARGET_CIDS)},
        "verdict_distribution": dict(verdict_dist),
        "image_verified_cids":  modified_cids,
    }
    EVIDENCE.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── Completion report ─────────────────────────────────────────────────────
    post_shas = {k: sha256_file(p) for k, p in PROTECTED.items()}
    sha_ok = all(post_shas[k] == pre_shas[k] for k in pre_shas)

    head_after = subprocess.check_output(["git", "log", "--oneline", "-1"], text=True).strip()

    verdict_full_dist = {
        "IMAGE_VERIFIED":          verdict_dist.get("IMAGE_VERIFIED", 0),
        "OFFICIAL_PAGE_NO_IMAGE":  verdict_dist.get("OFFICIAL_PAGE_NO_IMAGE", 0),
        "OFFICIAL_SITE_NOT_FOUND": verdict_dist.get("OFFICIAL_SITE_NOT_FOUND", 0),
        "IMAGE_CANDIDATE":         verdict_dist.get("IMAGE_CANDIDATE", 0),
        "WRONG_PLACE":             verdict_dist.get("WRONG_PLACE", 0),
        "IMAGE_URL_INACCESSIBLE":  verdict_dist.get("IMAGE_URL_INACCESSIBLE", 0),
        "FETCH_FAILED":            verdict_dist.get("FETCH_FAILED", 0),
    }

    image_verified_ct = verdict_dist.get("IMAGE_VERIFIED", 0)
    proposed_ct       = verdict_dist.get("IMAGE_PROPOSED_MANUAL_CHECK", 0)
    no_image_ct       = verdict_dist.get("OFFICIAL_PAGE_NO_IMAGE", 0) + verdict_dist.get("OFFICIAL_SITE_NOT_FOUND", 0)
    publishable_gain  = sum(1 for c in changed if c["v7"] in ("publishable", "publishable_with_caveat"))

    overall = "PASS" if sha_ok and len(v7_candidates) == 1642 else "FAIL"

    report = {
        "report_id":     "busan-image-recovery-v2-completion-report",
        "task":          TASK_ID,
        "verdict":       overall,
        "run_ts":        run_ts,
        "branch":        v7_summary["branch"],
        "head_before":   head_after,
        "head_after":    "(pre-commit)",
        "total_candidates": len(v7_candidates),
        "candidate_total_ok": len(v7_candidates) == 1642,
        "protected_sha_ok":   sha_ok,
        "external_requests":  request_count,
        "push":              False,

        "target_count":               37,
        "targets_processed":          len(vb_results),
        "verdict_distribution":        verdict_full_dist,
        "image_verified_count":        image_verified_ct,
        "manual_check_pending_count":  proposed_ct,
        "no_official_image_count":     no_image_ct,
        "needs_image_removed_count":   applied_count,

        "en_v6_distribution":  v7_summary["env6_distribution"],
        "en_v7_distribution":  dict(dist),
        "delta_vs_env6":       delta,
        "status_changed_count": len(changed),
        "change_types":         dict(change_types),
        "publishable_or_caveat_gain": publishable_gain,

        "prompt_validation": {
            "issues_found": False,
            "improvements_found": False,
            "notes": [
                "V2 대상 수 37건 정확 (V1의 31건 오류 수정됨).",
                "사전 소진 원천(FoodService MAIN_IMG_NORMAL, KTO firstimage) 명시 적절.",
                "VisitBusan URL 패턴 linkage index에서 확인: menuCd=DOM_000000201002001000.",
                "HOMEPAGE_URL 전원 공백 → OFFICIAL_SITE_NOT_FOUND 처리 (이번 실행 단계 C 스킵).",
                "권리 기준: operational_assumed (VisitBusan 공식 관광 페이지).",
            ],
        },
        "files_modified": [
            str(EC_FILE) if applied_count > 0 else None,
            str(ENV7_SUMMARY),
            str(ENV7_DETAILS),
            str(EVIDENCE),
            str(COMPLETION),
        ],
        "commit": None,
        "push":   False,
    }
    COMPLETION.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 65)
    print(f"TASK-BUSAN-IMAGE-RECOVERY-V2 완료 보고")
    print(f"  Overall:              {overall}")
    print(f"  37건 판정:")
    for k, v in verdict_full_dist.items():
        if v:
            print(f"    {k}: {v}")
    print(f"  IMAGE_VERIFIED:       {image_verified_ct}")
    print(f"  needs_image 제거:     {applied_count}")
    print(f"  EN_V6→V7 상태 변화:  {len(changed)}")
    print(f"  잠정 공개 증가:       {publishable_gain}")
    print(f"  외부 요청 수:         {request_count}")
    print(f"  candidate 총수:       {len(v7_candidates)}")
    print(f"  SHA 보존:             {sha_ok}")
    print("=" * 65)

    return overall


if __name__ == "__main__":
    result = main()
    sys.exit(0 if result == "PASS" else 1)
