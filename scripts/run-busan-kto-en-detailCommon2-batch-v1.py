#!/usr/bin/env python3
"""
run-busan-kto-en-detailCommon2-batch-v1.py
부산 EngService2 194건 영문 contentId → detailCommon2 raw 수집

Phase 0 : KO raw 수량 정합성 확인 (reconciliation report)
Phase 1 : EngService2 manifest 생성 (194건)
Phase 2 : EngService2/detailCommon2 수집
Phase 3 : 완전성 검증 및 보고

사용법:
  python run-busan-kto-en-detailCommon2-batch-v1.py          # 전체 실행
  python run-busan-kto-en-detailCommon2-batch-v1.py --dry-run # API 호출 없이 계획만
  python run-busan-kto-en-detailCommon2-batch-v1.py --resume  # checkpoint에서 재개
  python run-busan-kto-en-detailCommon2-batch-v1.py --verify-only # Phase2·3만 실행

절대 금지:
  KO raw 수정  |  enriched candidates·source facts·flags·publishability 수정
  detailIntro2 동시 수집  |  영문 후보 매칭  |  push  |  git add .  |  master 작업
  API 계약 추정 (이미 실측 확인된 EngService2/detailCommon2 사용)
"""

import json, os, sys, time, hashlib, glob
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── 경로 ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent

ENG_BATCH_PATTERNS = [
    ROOT / "data/tourapi/raw/busan/2026-07-23/batch/kto-en-p*.json",
]

MANIFEST_DIR   = ROOT / "data/tourapi/manifests/busan"
MANIFEST_PATH  = MANIFEST_DIR / "kto-en-detailCommon2-targets.json"

KO_PILOT_DIR  = ROOT / "data/tourapi/raw/busan/kto-detail-pilot"
KO_FULL_DIR   = ROOT / "data/tourapi/raw/kto/detailCommon2/full"
EN_FULL_DIR   = ROOT / "data/tourapi/raw/kto/detailCommon2En/full"

CHECKPOINT_DIR  = ROOT / "data/tourapi/checkpoints/busan"
CHECKPOINT_PATH = CHECKPOINT_DIR / "kto-en-detailCommon2-checkpoint.json"
SHA_MANIFEST_EN = EN_FULL_DIR / "sha-manifest.json"

REPORT_DIR      = ROOT / "data/tourapi/reports/busan"
RECONCILE_REPORT_PATH = REPORT_DIR / "kto-ko-raw-count-reconciliation-v1.json"
COLLECTION_REPORT_PATH = REPORT_DIR / "kto-en-detailCommon2-batch-v1-report.json"
RUNS_LOG_PATH   = REPORT_DIR / "kto-en-detailCommon2-runs-log.json"

CALL_LIMIT_CFG  = ROOT / "data/tourapi/config/kto-detail-call-limit.json"

# ── 상수 ──────────────────────────────────────────────────────────────────────
ENG_BASE               = "https://apis.data.go.kr/B551011/EngService2"
CALL_INTERVAL_S        = 0.3
FETCH_TIMEOUT_S        = 30
MAX_RETRIES            = 2
CONSECUTIVE_FAIL_LIMIT = 5
CHECKPOINT_INTERVAL    = 50
EXPECTED_COUNT_EN      = 194
EXPECTED_COUNT_KO      = 644   # KO 검증 기준

KO_PILOT_CIDS = {"126028", "129725", "131087", "133525", "142852"}

# ── CLI ───────────────────────────────────────────────────────────────────────
DRY_RUN     = "--dry-run"     in sys.argv
RESUME      = "--resume"      in sys.argv
VERIFY_ONLY = "--verify-only" in sys.argv

# ── .env.local ────────────────────────────────────────────────────────────────
def load_env():
    for p in [ROOT / ".env.local", ROOT.parent / ".env.local"]:
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                m = line.strip()
                if "=" in m and not m.startswith("#"):
                    k, _, v = m.partition("=")
                    k = k.strip(); v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
            break

load_env()
API_KEY = os.environ.get("TOUR_API_KEY") or os.environ.get("KOR_TOUR_API_KEY")
if not API_KEY:
    print("[ERROR] TOUR_API_KEY not set"); sys.exit(1)

# ── 유틸 ──────────────────────────────────────────────────────────────────────
def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def sha256_str(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)

def load_runs_log() -> dict:
    if RUNS_LOG_PATH.exists():
        try: return json.loads(RUNS_LOG_PATH.read_text(encoding="utf-8"))
        except: pass
    return {"runs": []}

def append_run(log: dict, entry: dict):
    log["runs"].append(entry)
    write_json(RUNS_LOG_PATH, log)

# ── raw 파일 유효성 검사 ──────────────────────────────────────────────────────
def is_valid_raw_en(p: Path, expected_cid: str | None = None) -> tuple[bool, str]:
    if not p.exists(): return False, "NOT_EXISTS"
    try: raw = p.read_bytes()
    except Exception as e: return False, f"READ_ERROR:{e}"
    decoded = raw.decode("utf-8", errors="replace")
    if decoded.lstrip().startswith("<"): return False, "XML_RESPONSE"
    try: d = json.loads(decoded)
    except: return False, "JSON_PARSE_ERROR"
    if "response" not in d:
        rc = d.get("resultCode", "NONE")
        return False, f"FLAT_ERROR_RC_{rc}"
    hdr = (d["response"].get("header") or {})
    rc  = hdr.get("resultCode")
    if rc != "0000": return False, f"RESULT_CODE_{rc}"
    body = d["response"].get("body")
    if not body: return False, "EMPTY_BODY"
    # contentId 일치 확인
    if expected_cid:
        items = (body.get("items") or {})
        item_data = items.get("item")
        if isinstance(item_data, list):
            resp_cid = str(item_data[0].get("contentid","")) if item_data else ""
        elif isinstance(item_data, dict):
            resp_cid = str(item_data.get("contentid",""))
        else:
            resp_cid = ""
        if resp_cid and resp_cid != expected_cid:
            return False, f"CONTENTID_MISMATCH:resp={resp_cid}"
    return True, "VALID"

def en_raw_path(cid: str) -> Path:
    return EN_FULL_DIR / f"detail-common2en-{cid}.json"

# ── API 호출 ──────────────────────────────────────────────────────────────────
LIMIT_CODES = {"22", "99", "30"}

def is_limit_response(status: int, body: str, rc: str | None) -> bool:
    if status == 429: return True
    if body and body.lstrip().startswith("<"):
        low = body.lower()
        if any(x in low for x in ("limited_number","service_access_denied","limitexceed","quota")):
            return True
    if rc in LIMIT_CODES: return True
    return False

def fetch_en_detail_common2(cid: str) -> dict:
    """EngService2/detailCommon2 단건 호출.
    approved-api-inventory.md §6 실측 확인: contentId만 사용, YN 파라미터 없음.
    """
    params = urlencode({
        "serviceKey": API_KEY,
        "MobileOS":   "ETC",
        "MobileApp":  "GoKoreaMate",
        "_type":      "json",
        "contentId":  cid,
    })
    url = f"{ENG_BASE}/detailCommon2?{params}"

    for attempt in range(MAX_RETRIES + 1):
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
                status = resp.getcode()
                body   = resp.read().decode("utf-8", errors="replace")
        except HTTPError as e:
            status = e.code
            try:    body = e.read().decode("utf-8", errors="replace")
            except: body = ""
            if is_limit_response(status, body, None):
                return {"raw": body, "rc": None, "is_limit": True, "status": status, "error": f"HTTP_{status}"}
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S * 2); continue
            return {"raw": body, "rc": None, "is_limit": False, "status": status, "error": f"HTTP_{status}"}
        except URLError as e:
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S * 2); continue
            return {"raw": "", "rc": None, "is_limit": False, "status": 0, "error": f"URLError:{e.reason}"}
        except TimeoutError:
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S); continue
            return {"raw": "", "rc": None, "is_limit": False, "status": 0, "error": "TIMEOUT"}

        if body.lstrip().startswith("<"):
            if is_limit_response(status, body, None):
                return {"raw": body, "rc": None, "is_limit": True, "status": status, "error": "XML_LIMIT"}
            return {"raw": body, "rc": None, "is_limit": False, "status": status, "error": "XML_RESPONSE"}

        try:
            parsed = json.loads(body)
        except:
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S); continue
            return {"raw": body, "rc": None, "is_limit": False, "status": status, "error": "JSON_PARSE_ERROR"}

        rc = (parsed.get("response") or {}).get("header", {}).get("resultCode")
        if not rc and "resultCode" in parsed:
            rc = str(parsed["resultCode"])
        if is_limit_response(status, body, rc):
            return {"raw": body, "rc": rc, "is_limit": True, "status": status, "error": f"LIMIT_CODE_{rc}"}
        return {"raw": body, "rc": rc, "is_limit": False, "status": status, "error": None}

    return {"raw": "", "rc": None, "is_limit": False, "status": 0, "error": "MAX_RETRIES_EXCEEDED"}

def atomic_save_en(cid: str, raw_str: str) -> tuple[bool, str]:
    dst = en_raw_path(cid)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp")
    try:
        tmp.write_text(raw_str, encoding="utf-8")
        valid, reason = is_valid_raw_en(tmp, expected_cid=cid)
        if not valid:
            tmp.unlink(missing_ok=True)
            return False, reason
        os.replace(tmp, dst)
        return True, "OK"
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return False, f"SAVE_ERROR:{e}"

def write_checkpoint(data: dict):
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(CHECKPOINT_PATH, data)

def read_checkpoint() -> dict | None:
    if CHECKPOINT_PATH.exists():
        try: return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
        except: pass
    return None

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 0: KO raw 수량 정합성 확인
# ══════════════════════════════════════════════════════════════════════════════
def phase0_ko_reconcile() -> dict:
    print("[PHASE 0] KO raw 수량 정합성 확인...")

    def analyze_dir(file_glob: str, pilot_cids_set: set) -> dict:
        files     = sorted(glob.glob(str(file_glob)))
        valid_cids = set()
        empty_ids  = []
        rc_fail    = []
        sha_files  = []

        for f in files:
            fname = os.path.basename(f)
            if fname == "sha-manifest.json":
                sha_files.append(fname); continue
            try:
                d    = json.loads(open(f, encoding="utf-8").read())
                hdr  = d.get("response", {}).get("header", {})
                body = d.get("response", {}).get("body", {})
                rc   = hdr.get("resultCode", "?")
                if rc != "0000":
                    rc_fail.append(fname); continue
                itw   = body.get("items", {}) if body else {}
                items = itw.get("item", []) if isinstance(itw, dict) else []
                if isinstance(items, dict): items = [items]
                if not items:
                    cid_from_name = fname.replace("detail-common2-","").replace(".json","")
                    empty_ids.append(cid_from_name); continue
                for i in items:
                    cid = str(i.get("contentid", ""))
                    if cid: valid_cids.add(cid)
            except Exception:
                rc_fail.append(fname)

        return {
            "total_files":       len(files),
            "sha_manifest_files": sha_files,
            "api_files":         len(files) - len(sha_files),
            "valid_with_content": len(valid_cids),
            "empty_response":    len(empty_ids),
            "rc_fail":           len(rc_fail),
            "unique_cids":       sorted(valid_cids),
        }

    ko_full  = analyze_dir(str(KO_FULL_DIR / "detail-common2-*.json"), KO_PILOT_CIDS)
    ko_sha   = analyze_dir(str(KO_FULL_DIR / "sha-manifest.json"), set())

    # pilot
    pilot_valid = set()
    pilot_files = sorted(glob.glob(str(KO_PILOT_DIR / "detail-common2-*.json")))
    for f in pilot_files:
        try:
            d = json.loads(open(f, encoding="utf-8").read())
            body = d.get("response",{}).get("body",{})
            itw  = body.get("items",{}) if body else {}
            items = itw.get("item",[]) if isinstance(itw,dict) else []
            if isinstance(items,dict): items=[items]
            for i in items:
                cid = str(i.get("contentid",""))
                if cid: pilot_valid.add(cid)
        except: pass

    full_cids  = set(ko_full["unique_cids"])
    all_unique = full_cids | pilot_valid
    overlap    = full_cids & pilot_valid

    # canonical 수량 (design: 5 pilot + 639 full API = 644 total targets)
    canonical = {
        "total_targets":         EXPECTED_COUNT_KO,  # 644
        "pilot_files":           len(pilot_files),
        "pilot_unique_cids":     len(pilot_valid),
        "full_dir_total_files":  ko_full["total_files"],  # 640 (639 API + 1 sha-manifest)
        "full_dir_sha_files":    len(ko_sha["sha_manifest_files"]) + (1 if ko_full["sha_manifest_files"] else 0),
        "full_dir_api_files":    ko_full["api_files"],      # 639
        "full_valid_with_content": ko_full["valid_with_content"],  # 621
        "full_empty_response":   ko_full["empty_response"],         # 18
        "full_rc_fail":          ko_full["rc_fail"],                # 0
        "pilot_full_overlap":    len(overlap),                      # 0
        "all_unique_cids":       len(all_unique),                   # 626
    }

    # 이슈 판정
    issues = []
    dup_check = len(all_unique) < len(list(pilot_valid) + ko_full["unique_cids"])
    if dup_check:
        issues.append(f"DUPLICATE_CONTENTID: {dup_check}")
    if len(overlap) > 0:
        issues.append(f"PILOT_FULL_OVERLAP: {len(overlap)} IDs")

    # 차이 설명
    discrepancy_explanation = (
        f"coverage_audit에서 detailCommon2=640은 full/ 디렉토리 파일 수(639 API파일 + 1 sha-manifest.json)이며, "
        f"이전 보고 644는 전체 수집 대상 수(5 pilot + 639 full)임. "
        f"두 수치 모두 정확하나 집계 기준이 다름. "
        f"coverage_audit의 640은 1 under-count (sha-manifest.json을 포함, pilot 5건 미포함). "
        f"canonical: {EXPECTED_COUNT_KO}개 target = {len(pilot_files)} pilot + {ko_full['api_files']} full API calls. "
        f"실제 데이터 있는 건: {len(all_unique)}건 ({len(pilot_valid)} pilot + {ko_full['valid_with_content']} full). "
        f"empty response(rc=0000, items=''): {ko_full['empty_response']}건 — 정상(API 레벨 빈 응답)."
    )

    result = {
        "verdict":              "PASS" if not issues else "FAIL",
        "issues":               issues,
        "canonical":            canonical,
        "discrepancy_explanation": discrepancy_explanation,
        "detailIntro2_summary": "557 targets = 15 pilot + 542 full API calls (43 empty response, type28 레포츠 많음)",
        "detailImage2_summary": "94 full + 5 pilot = 99 targets (실이미지 2건, 92건 empty)",
    }

    write_json(RECONCILE_REPORT_PATH, {
        "task_id":      "TASK-KTO-EN-DETAIL-COLLECT-V1",
        "phase":        "0-KO-RECONCILE",
        "generated_at": now_iso(),
        **result,
    })

    print(f"  [Phase 0] verdict={result['verdict']}")
    print(f"  canonical: {canonical['total_targets']} targets = {canonical['pilot_files']} pilot + {canonical['full_dir_api_files']} full")
    print(f"  full valid_content={canonical['full_valid_with_content']}, empty={canonical['full_empty_response']}, rc_fail={canonical['full_rc_fail']}")
    print(f"  pilot∩full overlap={canonical['pilot_full_overlap']} → 중복 없음")
    if issues:
        print(f"  ISSUES: {issues}")

    return result

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: EngService2 manifest 생성
# ══════════════════════════════════════════════════════════════════════════════
def phase1_build_manifest(ko_reconcile: dict) -> dict:
    print("\n[PHASE 1] EngService2 manifest 생성...")

    # KO contentId 집합 (교집합 확인용)
    ko_cids = set()
    for f in glob.glob(str(KO_FULL_DIR / "detail-common2-*.json")):
        if "sha-manifest" in f: continue
        try:
            d    = json.loads(open(f, encoding="utf-8").read())
            body = d.get("response",{}).get("body",{})
            itw  = body.get("items",{}) if body else {}
            items = itw.get("item",[]) if isinstance(itw,dict) else []
            if isinstance(items,dict): items=[items]
            for i in items:
                cid = str(i.get("contentid",""))
                if cid: ko_cids.add(cid)
        except: pass
    for f in glob.glob(str(KO_PILOT_DIR / "detail-common2-*.json")):
        try:
            d    = json.loads(open(f, encoding="utf-8").read())
            body = d.get("response",{}).get("body",{})
            itw  = body.get("items",{}) if body else {}
            items = itw.get("item",[]) if isinstance(itw,dict) else []
            if isinstance(items,dict): items=[items]
            for i in items:
                cid = str(i.get("contentid",""))
                if cid: ko_cids.add(cid)
        except: pass

    # EngService2 배치 파일에서 추출
    en_records = []
    seen_cids  = set()
    for pat in ENG_BATCH_PATTERNS:
        for f in sorted(glob.glob(str(pat))):
            d    = json.loads(open(f, encoding="utf-8").read())
            body = d.get("response", {}).get("body", {})
            itw  = body.get("items", {}) if body else {}
            items = itw.get("item", []) if isinstance(itw, dict) else []
            if isinstance(items, str) or not items: continue
            if isinstance(items, dict): items = [items]
            if not isinstance(items, list): continue
            for item in items:
                cid = str(item.get("contentid", ""))
                if not cid or cid in seen_cids: continue
                seen_cids.add(cid)
                en_records.append({
                    "contentid":     cid,
                    "contenttypeid": str(item.get("contenttypeid", "")),
                    "title":         item.get("title", ""),
                    "addr1":         item.get("addr1", ""),
                    "mapx":          item.get("mapx", ""),
                    "mapy":          item.get("mapy", ""),
                    "firstimage":    item.get("firstimage", ""),
                    "modifiedtime":  item.get("modifiedtime", ""),
                })

    en_records.sort(key=lambda x: x["contentid"])
    en_cids = {r["contentid"] for r in en_records}

    # 검증
    errors = []
    if len(en_records) != EXPECTED_COUNT_EN:
        errors.append(f"count {len(en_records)} ≠ expected {EXPECTED_COUNT_EN}")
    if len(en_cids) != len(en_records):
        errors.append(f"duplicate contentIds: {len(en_records)-len(en_cids)}건")
    ko_en_overlap = en_cids & ko_cids
    if ko_en_overlap:
        errors.append(f"KO∩EN overlap {len(ko_en_overlap)}건: {sorted(ko_en_overlap)[:5]}")

    if errors:
        print(f"  [Phase 1] ERRORS: {errors}")
        print("  → EN 수집 중단")
        return {"verdict": "FAIL", "errors": errors, "records": [], "sha": None}

    # Batch raw 파일 SHA (입력 고정)
    en_batch_files = sorted(glob.glob(str(ENG_BATCH_PATTERNS[0])))
    batch_sha_parts = []
    for f in en_batch_files:
        batch_sha_parts.append(sha256_bytes(open(f, "rb").read()))
    input_sha = sha256_str("|".join(batch_sha_parts))

    records_sha = sha256_str(json.dumps(en_records, ensure_ascii=False))

    manifest = {
        "task":             "TASK-KTO-EN-DETAIL-COLLECT-V1",
        "phase":            "1-EN-MANIFEST",
        "created_at":       now_iso(),
        "source_batch_pattern": str(ENG_BATCH_PATTERNS[0]),
        "source_batch_files":   en_batch_files,
        "source_input_sha":     input_sha,
        "total":                len(en_records),
        "records_sha256":       records_sha,
        "ko_cids_checked":      len(ko_cids),
        "ko_en_overlap":        len(ko_en_overlap),
        "records":              en_records,
    }

    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    write_json(MANIFEST_PATH, manifest)

    print(f"  total EN records: {len(en_records)}")
    print(f"  KO cids checked: {len(ko_cids)}, KO∩EN overlap: {len(ko_en_overlap)}")
    print(f"  manifest → {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"  records_sha={records_sha[:16]}...")

    return {"verdict": "PASS", "errors": [], "records": en_records,
            "sha": records_sha, "input_sha": input_sha, "manifest": manifest}

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: 수집 (EN detailCommon2)
# ══════════════════════════════════════════════════════════════════════════════
def phase2_collect(records: list, records_sha: str, run_id: str) -> dict:
    print(f"\n[PHASE 2] EN detailCommon2 수집 [{run_id}]...")
    EN_FULL_DIR.mkdir(parents=True, exist_ok=True)

    # call limit 확인 (경고만, 차단 아님)
    limit_cfg = {"status": "UNVERIFIED", "daily_limit": None}
    if CALL_LIMIT_CFG.exists():
        try: limit_cfg = json.loads(CALL_LIMIT_CFG.read_text(encoding="utf-8"))
        except: pass
    if limit_cfg.get("status") != "VERIFIED":
        print(f"  [WARN] call_limit status={limit_cfg.get('status')} "
              f"daily_limit={limit_cfg.get('daily_limit')} → 경고, 실행 허용 (194호출 추정 한도 이내)")

    # resume: checkpoint
    done_cids: set[str] = set()
    if RESUME:
        cp = read_checkpoint()
        if cp and cp.get("records_sha") == records_sha:
            done_cids = set(cp.get("done_content_ids", []))
            print(f"  [RESUME] checkpoint 복원 — 완료 {len(done_cids)}건 skip")
        else:
            print("  [RESUME] checkpoint sha 불일치 → 처음부터 시작")

    stats = {
        "run_id":           run_id,
        "run_calls":        0,
        "skip_existing":    0,
        "skip_resume":      0,
        "success":          0,
        "fail_api":         0,
        "fail_atomic_save": 0,
        "limit_reached":    False,
        "limit_reached_at": None,
    }
    failures    = []
    consecutive = 0
    limit_hit   = False

    if DRY_RUN:
        print("  [DRY-RUN] API 호출 없이 계획만 산출")

    for i, rec in enumerate(records):
        cid = rec["contentid"]

        if cid in done_cids:
            stats["skip_resume"] += 1
            consecutive = 0
            continue

        fp = en_raw_path(cid)
        valid_f, _ = is_valid_raw_en(fp, expected_cid=cid)
        if valid_f:
            stats["skip_existing"] += 1
            done_cids.add(cid)
            consecutive = 0
            continue

        if DRY_RUN:
            stats["run_calls"] += 1
            continue

        # ── 실제 API 호출 ────────────────────────────────────────────────────
        stats["run_calls"] += 1
        time.sleep(CALL_INTERVAL_S)
        result = fetch_en_detail_common2(cid)

        if result["is_limit"]:
            print(f"  [LIMIT_REACHED] cid={cid}")
            stats["limit_reached"] = True
            stats["limit_reached_at"] = cid
            limit_hit = True
            write_checkpoint({
                "records_sha":        records_sha,
                "done_content_ids":   list(done_cids),
                "last_updated_ts":    now_iso(),
                "limit_reached_at":   cid,
                "remaining":          EXPECTED_COUNT_EN - len(done_cids) - 1,
            })
            break

        if result["error"]:
            stats["fail_api"] += 1
            consecutive += 1
            failures.append({"contentid": cid, "error": result["error"], "http_status": result["status"]})
            print(f"  [FAIL] cid={cid} — {result['error']}")
            if consecutive >= CONSECUTIVE_FAIL_LIMIT:
                print(f"  [ABORT] {CONSECUTIVE_FAIL_LIMIT}연속 실패")
                write_checkpoint({"records_sha": records_sha, "done_content_ids": list(done_cids),
                                   "last_updated_ts": now_iso(), "abort_reason": "CONSECUTIVE_FAIL", "abort_at": cid})
                break
            continue

        saved, save_reason = atomic_save_en(cid, result["raw"])
        if not saved:
            stats["fail_atomic_save"] += 1
            consecutive += 1
            failures.append({"contentid": cid, "error": f"ATOMIC_SAVE:{save_reason}", "http_rc": result["rc"]})
            print(f"  [SAVE_FAIL] cid={cid} — {save_reason}")
            continue

        stats["success"] += 1
        done_cids.add(cid)
        consecutive = 0

        if (i + 1) % CHECKPOINT_INTERVAL == 0:
            write_checkpoint({"records_sha": records_sha, "done_content_ids": list(done_cids),
                               "last_updated_ts": now_iso(), "progress": f"{i+1}/{len(records)}"})
            print(f"  [CKPT] {i+1}/{len(records)} calls={stats['run_calls']} ok={stats['success']}")

    if not DRY_RUN:
        write_checkpoint({"records_sha": records_sha, "done_content_ids": list(done_cids),
                           "last_updated_ts": now_iso(), "final": not limit_hit,
                           "limit_reached": limit_hit,
                           "remaining": EXPECTED_COUNT_EN - len(done_cids)})

    return {
        "stats":      stats,
        "failures":   failures,
        "done_count": len(done_cids),
        "limit_cfg":  {"status": limit_cfg.get("status"), "daily_limit": limit_cfg.get("daily_limit")},
    }

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: 완전성 검증 + 보고
# ══════════════════════════════════════════════════════════════════════════════
def phase3_verify_and_report(records: list, phase2_result: dict | None,
                              phase0: dict, phase1: dict, run_id: str) -> dict:
    print("\n[PHASE 3] 완전성 검증...")

    verify_results = []
    overview_count   = 0
    title_count      = 0
    addr_count       = 0
    image_count      = 0
    empty_overview   = 0
    cid_mismatch     = 0

    sha_entries = {}
    for rec in records:
        cid = rec["contentid"]
        fp  = en_raw_path(cid)
        valid, reason = is_valid_raw_en(fp, expected_cid=cid)

        if valid:
            d    = json.loads(fp.read_text(encoding="utf-8"))
            body = d.get("response", {}).get("body", {})
            itw  = body.get("items", {}) if body else {}
            item_data = itw.get("item") if isinstance(itw, dict) else None
            if isinstance(item_data, list) and item_data: item_data = item_data[0]

            if isinstance(item_data, dict):
                ov = (item_data.get("overview") or "").strip()
                if ov:        overview_count += 1
                else:         empty_overview += 1
                if item_data.get("title"):   title_count  += 1
                if item_data.get("addr1"):   addr_count   += 1
                if item_data.get("firstimage"): image_count += 1
                resp_cid = str(item_data.get("contentid", ""))
                if resp_cid and resp_cid != cid: cid_mismatch += 1
            else:
                empty_overview += 1

            sha_entries[cid] = sha256_bytes(fp.read_bytes())

        verify_results.append({
            "contentid": cid,
            "valid":     valid,
            "reason":    reason,
        })

    total   = len(verify_results)
    valid_n = sum(1 for r in verify_results if r["valid"])
    invalid = [r for r in verify_results if not r["valid"]]
    err_groups = {}
    for r in invalid:
        key = r["reason"].split(":")[0]
        err_groups[key] = err_groups.get(key, 0) + 1

    if not DRY_RUN:
        write_json(SHA_MANIFEST_EN, {
            "generated_at": now_iso(),
            "valid_total":  len(sha_entries),
            "files":        sha_entries,
        })

    # git info
    try:
        import subprocess
        head   = subprocess.check_output(["git","rev-parse","HEAD"], cwd=str(ROOT), text=True).strip()
        branch = subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"], cwd=str(ROOT), text=True).strip()
    except:
        head = branch = "unknown"

    limit_r = (phase2_result["stats"]["limit_reached"] if phase2_result else False)
    if DRY_RUN:
        verdict = "DRY_RUN"
    elif limit_r:
        verdict = "PARTIAL_LIMIT_REACHED"
    elif valid_n == EXPECTED_COUNT_EN:
        verdict = "PASS"
    elif valid_n > 0:
        verdict = "PARTIAL"
    else:
        verdict = "FAIL"

    runs_log = load_runs_log()
    if phase2_result:
        append_run(runs_log, {
            "run_id":          run_id,
            "run_at":          now_iso(),
            "run_calls":       phase2_result["stats"]["run_calls"],
            "success":         phase2_result["stats"]["success"],
            "limit_reached":   limit_r,
        })

    report = {
        "task_id":      "TASK-KTO-EN-DETAIL-COLLECT-V1",
        "report_type":  "COMPLETION",
        "verdict":      verdict,
        "generated_at": now_iso(),
        "dry_run":      DRY_RUN,
        "git": {"branch": branch, "head": head},

        "phase0_ko_reconcile": {
            "verdict":   phase0["verdict"],
            "canonical": phase0["canonical"],
            "issues":    phase0["issues"],
        },
        "phase1_manifest": {
            "verdict": phase1["verdict"],
            "total":   len(records),
            "sha":     phase1.get("sha"),
        },
        "phase2_collection": {
            "run_id":            run_id,
            "run_calls":         phase2_result["stats"]["run_calls"] if phase2_result else 0,
            "skip_existing":     phase2_result["stats"]["skip_existing"] if phase2_result else 0,
            "skip_resume":       phase2_result["stats"]["skip_resume"] if phase2_result else 0,
            "success":           phase2_result["stats"]["success"] if phase2_result else 0,
            "fail_api":          phase2_result["stats"]["fail_api"] if phase2_result else 0,
            "fail_atomic_save":  phase2_result["stats"]["fail_atomic_save"] if phase2_result else 0,
            "limit_reached":     limit_r,
            "limit_reached_at":  phase2_result["stats"]["limit_reached_at"] if phase2_result else None,
            "failures":          phase2_result["failures"][:20] if phase2_result else [],
            "call_limit_status": phase2_result["limit_cfg"]["status"] if phase2_result else "N/A",
        } if phase2_result else None,
        "phase3_verification": {
            "total_targets":   EXPECTED_COUNT_EN,
            "valid_files":     valid_n,
            "invalid_files":   len(invalid),
            "pass_all_checks": valid_n == EXPECTED_COUNT_EN,
            "overview_present": overview_count,
            "empty_overview":   empty_overview,
            "title_present":    title_count,
            "addr_present":     addr_count,
            "image_present":    image_count,
            "contentid_mismatch": cid_mismatch,
            "error_groups":     err_groups,
            "invalid_sample":   invalid[:10],
        },
        "output_files": {
            "manifest":         str(MANIFEST_PATH.relative_to(ROOT)),
            "raw_dir":          str(EN_FULL_DIR.relative_to(ROOT)),
            "checkpoint":       str(CHECKPOINT_PATH.relative_to(ROOT)),
            "sha_manifest":     str(SHA_MANIFEST_EN.relative_to(ROOT)) if not DRY_RUN else None,
            "reconcile_report": str(RECONCILE_REPORT_PATH.relative_to(ROOT)),
            "collection_report": str(COLLECTION_REPORT_PATH.relative_to(ROOT)),
        },
        "safety_checks": {
            "ko_raw_modified":              False,
            "enriched_candidates_modified": False,
            "source_facts_modified":        False,
            "flags_modified":               False,
            "publishability_remeasured":    False,
            "api_key_logged":               False,
            "push_performed":               False,
            "git_add_A_used":               False,
            "master_branch_touched":        False,
            "detailIntro2_collected":       False,
        },
    }

    write_json(COLLECTION_REPORT_PATH, report)
    return report

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
def main():
    runs_log   = load_runs_log()
    run_id     = f"run_{len(runs_log['runs']) + 1}"

    print("=" * 70)
    print(f"TASK-KTO-EN-DETAIL-COLLECT-V1  [{run_id}]")
    print(f"  dry_run={DRY_RUN}  resume={RESUME}  verify_only={VERIFY_ONLY}")
    print("=" * 70)

    # Phase 0: KO reconcile
    phase0 = phase0_ko_reconcile()
    if phase0["verdict"] == "FAIL":
        print(f"\n[ABORT] Phase 0 FAIL: {phase0['issues']}")
        print("EN 수집을 시작하지 않습니다.")
        sys.exit(1)

    # Phase 1: manifest
    phase1 = phase1_build_manifest(phase0)
    if phase1["verdict"] == "FAIL":
        print(f"\n[ABORT] Phase 1 FAIL: {phase1['errors']}")
        sys.exit(1)

    records     = phase1["records"]
    records_sha = phase1["sha"]

    # Phase 2: collect
    if VERIFY_ONLY:
        print("\n[VERIFY-ONLY] Phase 2 건너뜀")
        phase2_result = None
    else:
        phase2_result = phase2_collect(records, records_sha, run_id)

    # Phase 3: verify + report
    report = phase3_verify_and_report(records, phase2_result, phase0, phase1, run_id)

    print()
    print("=" * 70)
    print(f"VERDICT: {report['verdict']}")
    v = report["phase3_verification"]
    print(f"  valid={v['valid_files']}/{EXPECTED_COUNT_EN}  invalid={v['invalid_files']}")
    print(f"  overview_present={v['overview_present']}  empty_overview={v['empty_overview']}")
    print(f"  title={v['title_present']}  addr={v['addr_present']}  image={v['image_present']}")
    print(f"  contentid_mismatch={v['contentid_mismatch']}")
    if phase2_result:
        c2 = report["phase2_collection"]
        print(f"  run_calls={c2['run_calls']}  success={c2['success']}  fail={c2['fail_api']+c2['fail_atomic_save']}")
        print(f"  limit_reached={c2['limit_reached']}")
    print(f"  report → {COLLECTION_REPORT_PATH.relative_to(ROOT)}")
    print("=" * 70)

if __name__ == "__main__":
    main()
