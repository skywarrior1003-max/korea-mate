#!/usr/bin/env python3
"""
run-busan-kto-detailCommon2-batch.py  (v2.1)
부산 KorService2 detailCommon2 raw batch 수집

Phase 0 : manifest 고정 (644건, SHA는 candidates 기준 결정적)
Phase 1 : 수집 — invalid/미완료 건만 교체, pilot 5건 재호출 금지, 원자적 저장
Phase 2 : 완전성 검증 — 644건 각각 resultCode·contentid·body 확인
Phase 3 : 보고 — run별 호출 수·한도 도달 여부 포함

사용법:
  python run-busan-kto-detailCommon2-batch.py          # 신규 or 전체 invalid 재처리
  python run-busan-kto-detailCommon2-batch.py --resume  # checkpoint에서 재개
  python run-busan-kto-detailCommon2-batch.py --dry-run # 계획만 출력
  python run-busan-kto-detailCommon2-batch.py --verify-only # Phase2·3만 실행

절대 금지:
  기존 파일 일괄 삭제  |  pilot 5건 재호출·덮어쓰기
  enriched candidates·source facts·flags·publishability 수정
  API key 출력·commit  |  push  |  git add .  |  master 작업
"""

import json, os, sys, time, hashlib
from pathlib import Path
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── 경로 ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent

ENRICHED_PATH   = ROOT / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
CALL_LIMIT_CFG  = ROOT / 'data/tourapi/config/kto-detail-call-limit.json'

MANIFEST_DIR    = ROOT / 'data/tourapi/manifests/busan'
MANIFEST_PATH   = MANIFEST_DIR / 'kto-detailCommon2-targets.json'

PILOT_RAW_DIR   = ROOT / 'data/tourapi/raw/busan/kto-detail-pilot'
FULL_RAW_DIR    = ROOT / 'data/tourapi/raw/kto/detailCommon2/full'

CHECKPOINT_DIR  = ROOT / 'data/tourapi/checkpoints/busan'
CHECKPOINT_PATH = CHECKPOINT_DIR / 'kto-detailCommon2-full-checkpoint.json'
SHA_MANIFEST    = FULL_RAW_DIR / 'sha-manifest.json'

REPORT_DIR      = ROOT / 'data/tourapi/reports/busan'
REPORT_PATH     = REPORT_DIR / 'kto-detailCommon2-raw-batch-report.json'
RUNS_LOG_PATH   = REPORT_DIR / 'kto-detailCommon2-runs-log.json'

# ── 파라미터 ──────────────────────────────────────────────────────────────────
KTO_BASE               = 'https://apis.data.go.kr/B551011/KorService2'
CALL_INTERVAL_S        = 0.3
FETCH_TIMEOUT_S        = 30
MAX_RETRIES            = 2
CONSECUTIVE_FAIL_LIMIT = 5
CHECKPOINT_INTERVAL    = 50
EXPECTED_COUNT         = 644
TARGET_SOURCE          = 'KorService2'

# pilot contentId 집합 — 절대 재호출·덮어쓰기 금지
PILOT_CONTENT_IDS = {'126028', '129725', '131087', '133525', '142852'}

# ── CLI ───────────────────────────────────────────────────────────────────────
DRY_RUN     = '--dry-run'     in sys.argv
RESUME      = '--resume'      in sys.argv
VERIFY_ONLY = '--verify-only' in sys.argv

# ── .env.local ────────────────────────────────────────────────────────────────
def load_env():
    for p in [ROOT / '.env.local', ROOT.parent / '.env.local']:
        if p.exists():
            for line in p.read_text(encoding='utf-8').splitlines():
                m = line.strip()
                if '=' in m and not m.startswith('#'):
                    k, _, v = m.partition('=')
                    k = k.strip(); v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
            break

load_env()
API_KEY = os.environ.get('TOUR_API_KEY') or os.environ.get('KOR_TOUR_API_KEY')
if not API_KEY:
    print('[ERROR] TOUR_API_KEY not set'); sys.exit(1)

# ── 유틸 ──────────────────────────────────────────────────────────────────────
def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def sha256_str(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def now_iso() -> str:
    return datetime.utcnow().isoformat() + 'Z'

def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)   # 원자적 교체

# ── runs log ──────────────────────────────────────────────────────────────────
def load_runs_log() -> dict:
    if RUNS_LOG_PATH.exists():
        try:
            return json.loads(RUNS_LOG_PATH.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {'runs': []}

def append_run(log: dict, entry: dict):
    log['runs'].append(entry)
    write_json(RUNS_LOG_PATH, log)

# ── is_valid_raw ──────────────────────────────────────────────────────────────
def is_valid_raw(p: Path, expected_cid: str | None = None) -> tuple[bool, str]:
    """
    PASS 조건 (모두 충족해야 valid):
      1. 파일 존재
      2. JSON 파싱 성공
      3. XML 아님
      4. response 키 존재 (flat error 포맷 아님)
      5. response.header.resultCode == '0000'
      6. response.body 존재
      7. response.body.items.item에서 contentid == expected_cid (expected_cid 주어진 경우)
    """
    if not p.exists():
        return False, 'NOT_EXISTS'
    try:
        raw = p.read_bytes()
    except Exception as e:
        return False, f'READ_ERROR:{e}'

    decoded = raw.decode('utf-8', errors='replace')
    if decoded.lstrip().startswith('<'):
        return False, 'XML_RESPONSE'

    try:
        d = json.loads(decoded)
    except Exception:
        return False, 'JSON_PARSE_ERROR'

    if 'response' not in d:
        # flat error format: {"resultCode":"10",...}
        rc = d.get('resultCode', 'NONE')
        return False, f'FLAT_ERROR_RC_{rc}'

    hdr = (d['response'].get('header') or {})
    rc = hdr.get('resultCode')
    if rc != '0000':
        return False, f'RESULT_CODE_{rc}'

    body = d['response'].get('body')
    if not body:
        return False, 'EMPTY_BODY'

    # contentid 일치 확인
    if expected_cid:
        items = (body.get('items') or {})
        item_data = items.get('item')
        if isinstance(item_data, list):
            resp_cid = str(item_data[0].get('contentid', '')) if item_data else ''
        elif isinstance(item_data, dict):
            resp_cid = str(item_data.get('contentid', ''))
        else:
            resp_cid = ''
        if resp_cid and resp_cid != expected_cid:
            return False, f'CONTENTID_MISMATCH:resp={resp_cid}'

    return True, 'VALID'

def pilot_raw_path(cid: str) -> Path:
    return PILOT_RAW_DIR / f'detail-common2-{cid}.json'

def full_raw_path(cid: str) -> Path:
    return FULL_RAW_DIR / f'detail-common2-{cid}.json'

# ── API 호출 ──────────────────────────────────────────────────────────────────
LIMIT_CODES = {'22', '99', '30'}

def is_limit_response(status: int, body: str, rc: str | None) -> bool:
    if status == 429:
        return True
    if body and body.lstrip().startswith('<'):
        low = body.lower()
        if any(x in low for x in ('limited_number', 'service_access_denied', 'limitexceed', 'quota')):
            return True
    if rc in LIMIT_CODES:
        return True
    return False

def fetch_detail_common2(cid: str) -> dict:
    """KorService2 detailCommon2 단건 호출.
    contentId만 추가 파라미터로 전달 (기존 .mjs 기준, YN 파라미터 일체 없음).
    """
    params = urlencode({
        'serviceKey': API_KEY,
        'MobileOS':   'ETC',
        'MobileApp':  'GoKoreaMate',
        '_type':      'json',
        'contentId':  cid,
    })
    url = f'{KTO_BASE}/detailCommon2?{params}'

    for attempt in range(MAX_RETRIES + 1):
        try:
            req = Request(url, headers={'Accept': 'application/json'})
            with urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
                status = resp.getcode()
                body   = resp.read().decode('utf-8', errors='replace')
        except HTTPError as e:
            status = e.code
            try:    body = e.read().decode('utf-8', errors='replace')
            except: body = ''
            if is_limit_response(status, body, None):
                return {'raw': body, 'rc': None, 'is_limit': True,
                        'status': status, 'error': f'HTTP_{status}'}
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S * 2); continue
            return {'raw': body, 'rc': None, 'is_limit': False,
                    'status': status, 'error': f'HTTP_{status}'}
        except URLError as e:
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S * 2); continue
            return {'raw': '', 'rc': None, 'is_limit': False,
                    'status': 0, 'error': f'URLError:{e.reason}'}
        except TimeoutError:
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S); continue
            return {'raw': '', 'rc': None, 'is_limit': False,
                    'status': 0, 'error': 'TIMEOUT'}

        if body.lstrip().startswith('<'):
            if is_limit_response(status, body, None):
                return {'raw': body, 'rc': None, 'is_limit': True,
                        'status': status, 'error': 'XML_LIMIT'}
            return {'raw': body, 'rc': None, 'is_limit': False,
                    'status': status, 'error': 'XML_RESPONSE'}

        try:
            parsed = json.loads(body)
        except Exception:
            if attempt < MAX_RETRIES:
                time.sleep(CALL_INTERVAL_S); continue
            return {'raw': body, 'rc': None, 'is_limit': False,
                    'status': status, 'error': 'JSON_PARSE_ERROR'}

        rc = (parsed.get('response') or {}).get('header', {}).get('resultCode')
        if not rc and 'resultCode' in parsed:
            # flat format
            rc = str(parsed['resultCode'])
        if is_limit_response(status, body, rc):
            return {'raw': body, 'rc': rc, 'is_limit': True,
                    'status': status, 'error': f'LIMIT_CODE_{rc}'}

        return {'raw': body, 'rc': rc, 'is_limit': False, 'status': status, 'error': None}

    return {'raw': '', 'rc': None, 'is_limit': False,
            'status': 0, 'error': 'MAX_RETRIES_EXCEEDED'}

def atomic_save(cid: str, raw_str: str) -> bool:
    """임시 파일 저장 → 내용 검증 → 원자적 rename. 실패 시 False 반환."""
    dst = full_raw_path(cid)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix('.tmp')
    try:
        tmp.write_text(raw_str, encoding='utf-8')
        valid, reason = is_valid_raw(tmp, expected_cid=cid)
        if not valid:
            tmp.unlink(missing_ok=True)
            return False, reason
        os.replace(tmp, dst)
        return True, 'OK'
    except Exception as e:
        tmp.unlink(missing_ok=True)
        return False, f'SAVE_ERROR:{e}'

# ── checkpoint ────────────────────────────────────────────────────────────────
def write_checkpoint(data: dict):
    write_json(CHECKPOINT_PATH, data)

def read_checkpoint() -> dict | None:
    if CHECKPOINT_PATH.exists():
        try:
            return json.loads(CHECKPOINT_PATH.read_text(encoding='utf-8'))
        except Exception:
            pass
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0: manifest 생성 (candidates SHA는 결정적)
# ═══════════════════════════════════════════════════════════════════════════════
def phase0_manifest() -> dict:
    print('[PHASE 0] manifest 생성...')
    candidates = []
    with open(ENRICHED_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            rec = json.loads(line)
            for sk in rec.get('source_summary', {}).get('source_keys', []):
                if sk.startswith('KorService2:'):
                    parts = sk.split(':')
                    if len(parts) >= 2 and parts[1]:
                        candidates.append({'candidate_id': rec['candidate_id'],
                                           'contentid':    parts[1]})
                    break

    candidates.sort(key=lambda x: x['candidate_id'])

    total = len(candidates)
    cid_set  = {c['contentid']    for c in candidates}
    cand_set = {c['candidate_id'] for c in candidates}
    errs = []
    if total != EXPECTED_COUNT: errs.append(f'count {total}≠{EXPECTED_COUNT}')
    if len(cid_set)  != total:  errs.append(f'contentid dup {total-len(cid_set)}건')
    if len(cand_set) != total:  errs.append(f'candidate_id dup {total-len(cand_set)}건')
    if errs:
        print(f'[PHASE 0] ABORT — {errs}'); sys.exit(1)

    # SHA: candidates 리스트만으로 결정적 계산 (timestamp 제외)
    cand_sha = sha256_str(json.dumps(candidates, ensure_ascii=False))

    manifest = {
        'task':        'TASK-KTO-DETAIL-COMMON-RAW-BATCH-V2',
        'created_at':  now_iso(),
        'source':      str(ENRICHED_PATH.relative_to(ROOT)),
        'sort_key':    'candidate_id',
        'total':       total,
        'candidates_sha256': cand_sha,   # 결정적, timestamp 미포함
        'candidates':  candidates,
    }
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    write_json(MANIFEST_PATH, manifest)
    print(f'  → {MANIFEST_PATH.relative_to(ROOT)} | {total}건 | cand_sha={cand_sha[:16]}...')
    return manifest

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: 수집 (invalid/미완료 건만, pilot 재호출 금지, 원자적 저장)
# ═══════════════════════════════════════════════════════════════════════════════
def phase1_collect(manifest: dict, run_id: str) -> dict:
    candidates = manifest['candidates']
    FULL_RAW_DIR.mkdir(parents=True, exist_ok=True)

    # 호출 한도 상태 (경고만, 차단 아님)
    limit_cfg = {'status': 'UNVERIFIED', 'daily_limit': None}
    if CALL_LIMIT_CFG.exists():
        try: limit_cfg = json.loads(CALL_LIMIT_CFG.read_text(encoding='utf-8'))
        except: pass
    if limit_cfg.get('status') != 'VERIFIED':
        print(f'[WARN] kto-detail-call-limit.json status={limit_cfg.get("status")} '
              f'daily_limit={limit_cfg.get("daily_limit")} → 경고, 실행 허용')

    # resume: done_ids 복원 (manifest SHA가 일치해야 신뢰)
    done_ids: set[str] = set()
    if RESUME:
        cp = read_checkpoint()
        if cp and cp.get('candidates_sha') == manifest['candidates_sha256']:
            done_ids = set(cp.get('done_content_ids', []))
            print(f'[RESUME] checkpoint 복원 — 완료 {len(done_ids)}건 skip')
        else:
            print('[RESUME] checkpoint candidates_sha 불일치 → 처음부터 시작')

    stats = {
        'run_id':            run_id,
        'run_calls':         0,   # 이번 run에서 실제 API 호출 수
        'skip_pilot':        0,
        'skip_valid_full':   0,
        'skip_resume':       0,
        'success':           0,
        'fail_api':          0,
        'fail_atomic_save':  0,
        'limit_reached':     False,
        'limit_reached_at':  None,
        'consecutive_fails': 0,
    }
    pilot_skips  = []
    failures     = []
    limit_reached = False
    consecutive  = 0

    if DRY_RUN:
        print('[DRY-RUN] 계획만 출력, API 호출 없음')

    for i, cand in enumerate(candidates):
        cid     = cand['contentid']
        cand_id = cand['candidate_id']

        # resume skip (이전 run에서 이미 valid로 확인된 건)
        if cid in done_ids:
            stats['skip_resume'] += 1
            consecutive = 0
            continue

        # pilot skip — 절대 재호출·덮어쓰기 금지
        if cid in PILOT_CONTENT_IDS:
            pp = pilot_raw_path(cid)
            valid_p, reason_p = is_valid_raw(pp, expected_cid=cid)
            if valid_p:
                stats['skip_pilot'] += 1
                pilot_skips.append({'contentid': cid, 'candidate_id': cand_id,
                                    'path': str(pp.relative_to(ROOT))})
                done_ids.add(cid)
                consecutive = 0
                continue
            else:
                # pilot 파일 자체가 invalid → full dir 확인, 그래도 없으면 skip (재호출 금지)
                fp = full_raw_path(cid)
                valid_f, _ = is_valid_raw(fp, expected_cid=cid)
                if valid_f:
                    stats['skip_valid_full'] += 1
                    done_ids.add(cid)
                    consecutive = 0
                    continue
                # pilot invalid + full dir도 없음: 재호출 금지 → failure 기록
                failures.append({'contentid': cid, 'candidate_id': cand_id,
                                 'error': f'PILOT_INVALID_NO_FALLBACK:{reason_p}'})
                stats['fail_api'] += 1
                continue

        # skip_existing: full dir에 valid 파일이 이미 있으면 skip
        fp = full_raw_path(cid)
        valid_f, reason_f = is_valid_raw(fp, expected_cid=cid)
        if valid_f:
            stats['skip_valid_full'] += 1
            done_ids.add(cid)
            consecutive = 0
            continue

        if DRY_RUN:
            stats['run_calls'] += 1
            continue

        # ── 실제 API 호출 ────────────────────────────────────────────────────
        stats['run_calls'] += 1
        time.sleep(CALL_INTERVAL_S)
        result = fetch_detail_common2(cid)

        if result['is_limit']:
            print(f'[LIMIT_REACHED] cid={cid}')
            stats['limit_reached'] = True
            stats['limit_reached_at'] = cid
            limit_reached = True
            write_checkpoint({
                'candidates_sha':    manifest['candidates_sha256'],
                'done_content_ids':  list(done_ids),
                'last_updated_ts':   now_iso(),
                'limit_reached_at':  cid,
                'remaining_target':  EXPECTED_COUNT - len(done_ids) - 1,
            })
            break

        if result['error']:
            stats['fail_api'] += 1
            consecutive += 1
            failures.append({'contentid': cid, 'candidate_id': cand_id,
                             'error': result['error'], 'http_status': result['status']})
            print(f'  [FAIL] {cand_id} cid={cid} — {result["error"]}')
            if consecutive >= CONSECUTIVE_FAIL_LIMIT:
                print(f'[ABORT] {CONSECUTIVE_FAIL_LIMIT}연속 실패')
                stats['consecutive_fails'] = consecutive
                write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                                  'done_content_ids': list(done_ids),
                                  'last_updated_ts': now_iso(),
                                  'abort_reason': 'CONSECUTIVE_FAIL', 'abort_at': cid})
                break
            continue

        # 원자적 저장 (임시파일 → 검증 → rename)
        saved, save_reason = atomic_save(cid, result['raw'])
        if not saved:
            stats['fail_atomic_save'] += 1
            failures.append({'contentid': cid, 'candidate_id': cand_id,
                             'error': f'ATOMIC_SAVE_FAIL:{save_reason}',
                             'http_rc': result['rc']})
            consecutive += 1
            print(f'  [SAVE_FAIL] {cand_id} cid={cid} — {save_reason}')
            continue

        stats['success'] += 1
        done_ids.add(cid)
        consecutive = 0

        if (i + 1) % CHECKPOINT_INTERVAL == 0:
            write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                              'done_content_ids': list(done_ids),
                              'last_updated_ts': now_iso(),
                              'progress': f'{i+1}/{len(candidates)}'})
            print(f'  [CKPT] {i+1}/{len(candidates)} '
                  f'calls={stats["run_calls"]} ok={stats["success"]} '
                  f'fail={stats["fail_api"]+stats["fail_atomic_save"]}')

    stats['consecutive_fails'] = consecutive
    # 최종 checkpoint
    if not DRY_RUN:
        write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                          'done_content_ids': list(done_ids),
                          'last_updated_ts': now_iso(),
                          'final': not limit_reached,
                          'limit_reached': limit_reached,
                          'remaining_target': EXPECTED_COUNT - len(done_ids)})

    return {
        'stats':        stats,
        'pilot_skips':  pilot_skips,
        'failures':     failures,
        'done_count':   len(done_ids),
        'limit_cfg':    {'status': limit_cfg.get('status'), 'daily_limit': limit_cfg.get('daily_limit')},
    }

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: 완전성 검증
# ═══════════════════════════════════════════════════════════════════════════════
def phase2_verify(manifest: dict) -> dict:
    """644건 전체를 pilot dir + full dir 통합 검증."""
    candidates = manifest['candidates']
    results = []

    for cand in candidates:
        cid     = cand['contentid']
        cand_id = cand['candidate_id']

        # pilot dir 우선 (pilot이면 full은 없어야 정상)
        if cid in PILOT_CONTENT_IDS:
            p = pilot_raw_path(cid)
        else:
            p = full_raw_path(cid)

        valid, reason = is_valid_raw(p, expected_cid=cid)
        results.append({
            'contentid':    cid,
            'candidate_id': cand_id,
            'valid':        valid,
            'reason':       reason,
            'path':         str(p.relative_to(ROOT)) if p.exists() else None,
        })

    total   = len(results)
    valid_n = sum(1 for r in results if r['valid'])
    invalid = [r for r in results if not r['valid']]

    # SHA manifest 생성 (valid 파일만)
    sha_entries = {}
    for r in results:
        if r['valid'] and r['path']:
            fp = ROOT / r['path']
            if fp.exists():
                sha_entries[r['contentid']] = sha256_bytes(fp.read_bytes())

    if not DRY_RUN:
        write_json(SHA_MANIFEST, {'generated_at': now_iso(),
                                   'valid_total': len(sha_entries),
                                   'files': sha_entries})

    # 오류 분류
    err_groups: dict[str, int] = {}
    for r in invalid:
        key = r['reason'].split(':')[0]
        err_groups[key] = err_groups.get(key, 0) + 1

    return {
        'total':         total,
        'valid':         valid_n,
        'invalid':       len(invalid),
        'pass':          (valid_n == EXPECTED_COUNT),
        'invalid_list':  invalid[:50],   # 최대 50건 기록
        'error_groups':  err_groups,
        'sha_manifest':  str(SHA_MANIFEST.relative_to(ROOT)) if not DRY_RUN else None,
    }

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: 보고
# ═══════════════════════════════════════════════════════════════════════════════
def phase3_report(manifest: dict, phase1: dict | None, verify: dict, run_id: str):
    runs_log = load_runs_log()

    # 이번 run 기록
    run_entry = {
        'run_id':          run_id,
        'started_at':      now_iso(),
        'run_calls':       phase1['stats']['run_calls'] if phase1 else 0,
        'success':         phase1['stats']['success']   if phase1 else 0,
        'limit_reached':   phase1['stats']['limit_reached'] if phase1 else False,
        'limit_reached_at':phase1['stats']['limit_reached_at'] if phase1 else None,
    }
    if phase1:
        append_run(runs_log, run_entry)

    # 이번 run이 VERIFY_ONLY면 이전 run들 통계만
    run1_calls = next((r['run_calls'] for r in runs_log['runs'] if r['run_id'] == 'run_1'), 0)
    run2_calls = next((r['run_calls'] for r in runs_log['runs'] if r['run_id'] == 'run_2'), 0)
    run3_calls = next((r['run_calls'] for r in runs_log['runs'] if r['run_id'] == 'run_3'), 0)

    limit_r = phase1['stats']['limit_reached'] if phase1 else False
    if limit_r:
        verdict = 'PARTIAL_LIMIT_REACHED'
        remaining = EXPECTED_COUNT - verify['valid']
    elif verify['pass']:
        verdict = 'PASS'
        remaining = 0
    else:
        verdict = 'FAIL'
        remaining = verify['invalid']

    try:
        import subprocess
        head   = subprocess.check_output(['git','rev-parse','HEAD'],          cwd=str(ROOT), text=True).strip()
        branch = subprocess.check_output(['git','rev-parse','--abbrev-ref','HEAD'], cwd=str(ROOT), text=True).strip()
    except Exception:
        head = branch = 'unknown'

    report = {
        'task_id':     'TASK-KTO-DETAIL-COMMON-RAW-BATCH-V2',
        'report_type': 'COMPLETION',
        'verdict':     verdict,
        'generated_at': now_iso(),
        'dry_run':     DRY_RUN,
        'git':         {'branch': branch, 'head': head},

        'manifest': {
            'path':           str(MANIFEST_PATH.relative_to(ROOT)),
            'total':          manifest['total'],
            'candidates_sha256': manifest['candidates_sha256'],
        },

        'call_limit': phase1['limit_cfg'] if phase1 else {},

        # ── 호출량 run별 분리 기록 ─────────────────────────────────────────
        'api_call_tracking': {
            'run_1_invalid_params_calls': run1_calls,
            'run_2_correct_calls':        run2_calls,
            'run_3_calls':                run3_calls,
            'total_calls_all_runs':       sum(r.get('run_calls',0) for r in runs_log['runs']),
            'limit_reached':              limit_r,
            'limit_reached_at_cid':       phase1['stats']['limit_reached_at'] if phase1 else None,
            'remaining_after_limit':      remaining if limit_r else 0,
        },

        # ── Phase 2 검증 결과 ──────────────────────────────────────────────
        'phase2_verification': {
            'total_target':   EXPECTED_COUNT,
            'valid_files':    verify['valid'],
            'invalid_files':  verify['invalid'],
            'pass_all_checks': verify['pass'],
            'checks_applied': [
                'JSON 파싱 성공',
                'response 키 존재 (flat error 아님)',
                'response.header.resultCode == 0000',
                'response.body 존재',
                'response contentid == 요청 contentId',
            ],
            'error_groups':   verify['error_groups'],
            'invalid_sample': verify['invalid_list'][:10],
        },

        # ── 이번 run 상세 ──────────────────────────────────────────────────
        'run_detail': {
            'run_id':           run_id,
            'run_calls':        phase1['stats']['run_calls'] if phase1 else 0,
            'skip_pilot':       phase1['stats']['skip_pilot'] if phase1 else 0,
            'skip_valid_full':  phase1['stats']['skip_valid_full'] if phase1 else 0,
            'skip_resume':      phase1['stats']['skip_resume'] if phase1 else 0,
            'success_new':      phase1['stats']['success'] if phase1 else 0,
            'fail_api':         phase1['stats']['fail_api'] if phase1 else 0,
            'fail_atomic_save': phase1['stats']['fail_atomic_save'] if phase1 else 0,
            'failures':         phase1['failures'][:20] if phase1 else [],
        } if phase1 else None,

        'partial_limit_reached_next_step': (
            f'PARTIAL_LIMIT_REACHED: {remaining}건 미완료. '
            'kto-detail-call-limit.json 확인 후 다음 날 --resume 으로 재개.'
        ) if limit_r else None,

        'sha_manifest_path': verify['sha_manifest'],

        'safety_checks': {
            'enriched_candidates_modified': False,
            'source_facts_modified':        False,
            'flags_modified':               False,
            'api_key_logged':               False,
            'push_performed':               False,
            'git_add_A_used':               False,
            'pilot_files_overwritten':      False,
            'bulk_deletion_performed':      False,
        },
    }

    write_json(REPORT_PATH, report)
    return report

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    # run_id 결정
    runs_log = load_runs_log()
    existing_runs = len(runs_log['runs'])
    run_id = f'run_{existing_runs + 1}'

    print('=' * 70)
    print(f'TASK-KTO-DETAIL-COMMON-RAW-BATCH-V2  [{run_id}]')
    print(f'  dry_run={DRY_RUN}  resume={RESUME}  verify_only={VERIFY_ONLY}')
    print('=' * 70)

    manifest = phase0_manifest()

    if VERIFY_ONLY:
        print('[VERIFY-ONLY] Phase 1 건너뜀')
        phase1_result = None
    else:
        phase1_result = phase1_collect(manifest, run_id)

    print('\n[PHASE 2] 완전성 검증...')
    verify = phase2_verify(manifest)
    print(f'  valid={verify["valid"]}/{verify["total"]}  invalid={verify["invalid"]}  pass={verify["pass"]}')
    if verify['error_groups']:
        print(f'  오류 유형: {verify["error_groups"]}')

    report = phase3_report(manifest, phase1_result, verify, run_id)

    print()
    print('=' * 70)
    print(f'VERDICT: {report["verdict"]}')
    v = report['phase2_verification']
    print(f'  valid={v["valid_files"]}/{EXPECTED_COUNT}  invalid={v["invalid_files"]}')
    ct = report['api_call_tracking']
    print(f'  run_1(invalid params)={ct["run_1_invalid_params_calls"]}  '
          f'run_2(correct)={ct["run_2_correct_calls"]}  '
          f'total={ct["total_calls_all_runs"]}')
    print(f'  LIMIT_REACHED={ct["limit_reached"]}')
    print(f'  report → {REPORT_PATH.relative_to(ROOT)}')
    print('=' * 70)

if __name__ == '__main__':
    main()
