#!/usr/bin/env python3
"""
run-busan-kto-detailImage2-batch.py
부산 KorService2 detailImage2 raw batch 수집 (TASK-KTO-DETAIL-IMAGE-RAW-BATCH-V1)

Phase 0 : manifest 생성 (94건)
Phase 1 : 수집 — skip_existing, atomic save, LIMIT_REACHED 즉시 중단
Phase 2 : 완전성 검증 — 94건 각각 5항목 + 이미지 필드 존재 여부
Phase 3 : 보고

사용법:
  python run-busan-kto-detailImage2-batch.py
  python run-busan-kto-detailImage2-batch.py --resume
  python run-busan-kto-detailImage2-batch.py --dry-run   (실제 HTTP 0건)
  python run-busan-kto-detailImage2-batch.py --verify-only

절대 금지:
  enriched candidates·source facts·review_flags·publishability 수정
  다른 endpoint 재호출  |  API key 출력·commit  |  push  |  git add .  |  master
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

ENRICHED_PATH  = ROOT / 'data/tourapi/enriched/busan/busan-enriched-candidates-v1.jsonl'
CALL_LIMIT_CFG = ROOT / 'data/tourapi/config/kto-detail-call-limit.json'

MANIFEST_DIR   = ROOT / 'data/tourapi/manifests/busan'
MANIFEST_PATH  = MANIFEST_DIR / 'kto-detailImage2-targets.json'

PILOT_RAW_DIR  = ROOT / 'data/tourapi/raw/busan/kto-detail-pilot'
FULL_RAW_DIR   = ROOT / 'data/tourapi/raw/kto/detailImage2/full'

CHECKPOINT_DIR  = ROOT / 'data/tourapi/checkpoints/busan'
CHECKPOINT_PATH = CHECKPOINT_DIR / 'kto-detailImage2-full-checkpoint.json'
SHA_MANIFEST    = FULL_RAW_DIR / 'sha-manifest.json'

REPORT_DIR     = ROOT / 'data/tourapi/reports/busan'
REPORT_PATH    = REPORT_DIR / 'kto-detailImage2-raw-batch-report.json'
RUNS_LOG_PATH  = REPORT_DIR / 'kto-detailImage2-runs-log.json'

# ── 파라미터 ──────────────────────────────────────────────────────────────────
KTO_BASE               = 'https://apis.data.go.kr/B551011/KorService2'
CALL_INTERVAL_S        = 0.3
FETCH_TIMEOUT_S        = 30
MAX_RETRIES            = 2
CONSECUTIVE_FAIL_LIMIT = 5
CHECKPOINT_INTERVAL    = 50
EXPECTED_COUNT         = 94

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
    os.replace(tmp, path)

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

# ── 경로 유틸 ─────────────────────────────────────────────────────────────────
def pilot_raw_path(cid: str) -> Path:
    return PILOT_RAW_DIR / f'detail-image2-{cid}.json'

def full_raw_path(cid: str) -> Path:
    return FULL_RAW_DIR / f'detail-image2-{cid}.json'

# ── is_valid_raw ──────────────────────────────────────────────────────────────
def is_valid_raw(p: Path, expected_cid: str | None = None) -> tuple[bool, str]:
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
        rc = d.get('resultCode', 'NONE')
        return False, f'FLAT_ERROR_RC_{rc}'
    hdr = (d['response'].get('header') or {})
    if hdr.get('resultCode') != '0000':
        return False, f'RESULT_CODE_{hdr.get("resultCode")}'
    body = d['response'].get('body')
    if not body:
        return False, 'EMPTY_BODY'
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

def write_checkpoint(data: dict):
    write_json(CHECKPOINT_PATH, data)

def read_checkpoint() -> dict | None:
    if CHECKPOINT_PATH.exists():
        try:
            return json.loads(CHECKPOINT_PATH.read_text(encoding='utf-8'))
        except Exception:
            pass
    return None

# ── API 호출 ──────────────────────────────────────────────────────────────────
LIMIT_CODES = {'22', '99', '30'}

def is_limit_response(status: int, body: str, rc: str | None) -> bool:
    if status == 429: return True
    if body and body.lstrip().startswith('<'):
        low = body.lower()
        if any(x in low for x in ('limited_number', 'service_access_denied', 'limitexceed', 'quota')):
            return True
    return rc in LIMIT_CODES

def fetch_detail_image2(cid: str) -> dict:
    """KorService2 detailImage2 단건 호출.
    params: contentId + imageYN='Y' (기존 .mjs line 991 기준).
    """
    params = urlencode({
        'serviceKey': API_KEY,
        'MobileOS':   'ETC',
        'MobileApp':  'GoKoreaMate',
        '_type':      'json',
        'contentId':  cid,
        'imageYN':    'Y',
    })
    url = f'{KTO_BASE}/detailImage2?{params}'

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
            rc = str(parsed['resultCode'])
        if is_limit_response(status, body, rc):
            return {'raw': body, 'rc': rc, 'is_limit': True,
                    'status': status, 'error': f'LIMIT_CODE_{rc}'}
        return {'raw': body, 'rc': rc, 'is_limit': False, 'status': status, 'error': None}

    return {'raw': '', 'rc': None, 'is_limit': False, 'status': 0, 'error': 'MAX_RETRIES_EXCEEDED'}

def atomic_save(cid: str, raw_str: str) -> tuple[bool, str]:
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

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 0: manifest
# ═══════════════════════════════════════════════════════════════════════════════
def phase0_manifest() -> dict:
    print('[PHASE 0] manifest 생성...')
    candidates = []
    seen: set[str] = set()

    with open(ENRICHED_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            c = json.loads(line)
            flags  = c.get('validation', {}).get('review_flags', [])
            images = c.get('image_assessment', {}).get('curated_images', [])
            sk = next((k for k in c.get('source_summary', {}).get('source_keys', [])
                       if k.startswith('KorService2:')), None)
            if not sk: continue
            cid = sk.split(':')[1]
            if not cid or cid in seen: continue
            if 'needs_image' in flags and len(images) == 0:
                seen.add(cid)
                candidates.append({'candidate_id': c['candidate_id'],
                                   'contentid': cid,
                                   'source_type': 'KorService2',
                                   'target_endpoint': 'detailImage2'})

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

    cand_sha = sha256_str(json.dumps(candidates, ensure_ascii=False))
    manifest = {
        'task':              'TASK-KTO-DETAIL-IMAGE-RAW-BATCH-V1',
        'created_at':        now_iso(),
        'source':            str(ENRICHED_PATH.relative_to(ROOT)),
        'filter':            'needs_image flag + curated_images=0 + KorService2 source',
        'sort_key':          'candidate_id',
        'total':             total,
        'candidates_sha256': cand_sha,
        'candidates':        candidates,
    }
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    write_json(MANIFEST_PATH, manifest)
    print(f'  → {MANIFEST_PATH.relative_to(ROOT)} | {total}건 | sha={cand_sha[:16]}...')
    return manifest

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: 수집
# ═══════════════════════════════════════════════════════════════════════════════
def phase1_collect(manifest: dict, run_id: str) -> dict:
    candidates = manifest['candidates']
    FULL_RAW_DIR.mkdir(parents=True, exist_ok=True)

    limit_cfg = {'status': 'UNVERIFIED', 'daily_limit': None}
    if CALL_LIMIT_CFG.exists():
        try: limit_cfg = json.loads(CALL_LIMIT_CFG.read_text(encoding='utf-8'))
        except: pass
    if limit_cfg.get('status') != 'VERIFIED':
        print(f'[WARN] call-limit status={limit_cfg.get("status")} → 경고, 실행 허용')

    done_ids: set[str] = set()
    if RESUME:
        cp = read_checkpoint()
        if cp and cp.get('candidates_sha') == manifest['candidates_sha256']:
            done_ids = set(cp.get('done_content_ids', []))
            print(f'[RESUME] {len(done_ids)}건 skip')
        else:
            print('[RESUME] SHA 불일치 → 처음부터')

    stats = {
        'run_id': run_id, 'run_calls': 0,
        'skip_pilot': 0, 'skip_valid_full': 0, 'skip_resume': 0,
        'success': 0, 'fail_api': 0, 'fail_atomic_save': 0,
        'limit_reached': False, 'limit_reached_at': None, 'consecutive_fails': 0,
    }
    pilot_skips, failures = [], []
    consecutive = 0

    if DRY_RUN:
        print('[DRY-RUN] 실제 HTTP 0건 — 계획만 출력')

    for i, cand in enumerate(candidates):
        cid     = cand['contentid']
        cand_id = cand['candidate_id']

        if cid in done_ids:
            stats['skip_resume'] += 1; consecutive = 0; continue

        # pilot skip
        pp = pilot_raw_path(cid)
        valid_p, _ = is_valid_raw(pp, expected_cid=cid)
        if valid_p:
            stats['skip_pilot'] += 1
            pilot_skips.append({'contentid': cid, 'candidate_id': cand_id,
                                 'path': str(pp.relative_to(ROOT))})
            done_ids.add(cid); consecutive = 0; continue

        # skip_existing: full dir
        fp = full_raw_path(cid)
        valid_f, _ = is_valid_raw(fp, expected_cid=cid)
        if valid_f:
            stats['skip_valid_full'] += 1
            done_ids.add(cid); consecutive = 0; continue

        if DRY_RUN:
            stats['run_calls'] += 1; continue

        stats['run_calls'] += 1
        time.sleep(CALL_INTERVAL_S)
        result = fetch_detail_image2(cid)

        if result['is_limit']:
            print(f'[LIMIT_REACHED] cid={cid}')
            stats['limit_reached'] = True; stats['limit_reached_at'] = cid
            write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                              'done_content_ids': list(done_ids), 'last_updated_ts': now_iso(),
                              'limit_reached_at': cid,
                              'remaining_target': EXPECTED_COUNT - len(done_ids) - 1})
            break

        if result['error']:
            stats['fail_api'] += 1; consecutive += 1
            failures.append({'contentid': cid, 'candidate_id': cand_id,
                             'error': result['error'], 'http_status': result['status']})
            print(f'  [FAIL] {cand_id} cid={cid} — {result["error"]}')
            if consecutive >= CONSECUTIVE_FAIL_LIMIT:
                print(f'[ABORT] {CONSECUTIVE_FAIL_LIMIT}연속 실패')
                stats['consecutive_fails'] = consecutive
                write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                                  'done_content_ids': list(done_ids), 'last_updated_ts': now_iso(),
                                  'abort_reason': 'CONSECUTIVE_FAIL', 'abort_at': cid})
                break
            continue

        saved, reason = atomic_save(cid, result['raw'])
        if not saved:
            stats['fail_atomic_save'] += 1; consecutive += 1
            failures.append({'contentid': cid, 'candidate_id': cand_id,
                             'error': f'ATOMIC_SAVE_FAIL:{reason}', 'http_rc': result['rc']})
            print(f'  [SAVE_FAIL] {cand_id} cid={cid} — {reason}'); continue

        stats['success'] += 1; done_ids.add(cid); consecutive = 0

        if (i + 1) % CHECKPOINT_INTERVAL == 0:
            write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                              'done_content_ids': list(done_ids), 'last_updated_ts': now_iso(),
                              'progress': f'{i+1}/{len(candidates)}'})
            print(f'  [CKPT] {i+1}/{len(candidates)} calls={stats["run_calls"]} '
                  f'ok={stats["success"]} fail={stats["fail_api"]+stats["fail_atomic_save"]}')

    stats['consecutive_fails'] = consecutive
    if not DRY_RUN:
        write_checkpoint({'candidates_sha': manifest['candidates_sha256'],
                          'done_content_ids': list(done_ids), 'last_updated_ts': now_iso(),
                          'final': not stats['limit_reached'],
                          'limit_reached': stats['limit_reached'],
                          'remaining_target': EXPECTED_COUNT - len(done_ids)})
    return {'stats': stats, 'pilot_skips': pilot_skips, 'failures': failures,
            'done_count': len(done_ids),
            'limit_cfg': {'status': limit_cfg.get('status'), 'daily_limit': limit_cfg.get('daily_limit')}}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: 검증
# ═══════════════════════════════════════════════════════════════════════════════
def phase2_verify(manifest: dict) -> dict:
    from collections import Counter
    candidates = manifest['candidates']
    results = []

    for cand in candidates:
        cid     = cand['contentid']
        cand_id = cand['candidate_id']
        pp, fp  = pilot_raw_path(cid), full_raw_path(cid)
        if pp.exists():
            valid, reason = is_valid_raw(pp, expected_cid=cid)
            src, p_used = 'pilot', pp
        else:
            valid, reason = is_valid_raw(fp, expected_cid=cid)
            src, p_used = 'full', fp

        # 이미지 필드 존재 확인 (valid일 때만)
        img_count = 0
        if valid and p_used.exists():
            try:
                d = json.loads(p_used.read_text(encoding='utf-8'))
                items = (d.get('response', {}).get('body', {}).get('items') or {})
                arr = items.get('item', [])
                if not isinstance(arr, list): arr = [arr] if arr else []
                img_count = len([x for x in arr if x.get('originimgurl') or x.get('smallimageurl')])
            except Exception:
                pass

        results.append({'contentid': cid, 'candidate_id': cand_id,
                        'valid': valid, 'reason': reason,
                        'source': src, 'img_count': img_count,
                        'path': str(p_used.relative_to(ROOT)) if p_used.exists() else None})

    valid_n   = sum(1 for r in results if r['valid'])
    invalid   = [r for r in results if not r['valid']]
    with_imgs = sum(1 for r in results if r['valid'] and r['img_count'] > 0)
    no_imgs   = sum(1 for r in results if r['valid'] and r['img_count'] == 0)

    sha_entries = {}
    for r in results:
        if r['valid'] and r['path']:
            fp = ROOT / r['path']
            if fp.exists():
                sha_entries[r['contentid']] = sha256_bytes(fp.read_bytes())

    if not DRY_RUN:
        write_json(SHA_MANIFEST, {'generated_at': now_iso(),
                                   'valid_total': len(sha_entries), 'files': sha_entries})

    err_groups = dict(Counter(r['reason'].split(':')[0] for r in invalid))
    return {'total': len(results), 'valid': valid_n, 'invalid': len(invalid),
            'pass': (valid_n == EXPECTED_COUNT), 'invalid_list': invalid[:50],
            'error_groups': err_groups, 'with_images': with_imgs, 'no_images': no_imgs,
            'sha_manifest': str(SHA_MANIFEST.relative_to(ROOT)) if not DRY_RUN else None}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: 보고
# ═══════════════════════════════════════════════════════════════════════════════
def phase3_report(manifest: dict, phase1: dict | None, verify: dict, run_id: str):
    runs_log = load_runs_log()
    run_entry = {
        'run_id': run_id, 'started_at': now_iso(),
        'run_calls': phase1['stats']['run_calls'] if phase1 else 0,
        'success':   phase1['stats']['success']   if phase1 else 0,
        'limit_reached':    phase1['stats']['limit_reached']    if phase1 else False,
        'limit_reached_at': phase1['stats']['limit_reached_at'] if phase1 else None,
    }
    if phase1: append_run(runs_log, run_entry)

    limit_r = phase1['stats']['limit_reached'] if phase1 else False
    verdict = 'PARTIAL_LIMIT_REACHED' if limit_r else ('PASS' if verify['pass'] else 'FAIL')

    try:
        import subprocess
        head   = subprocess.check_output(['git','rev-parse','HEAD'],               cwd=str(ROOT), text=True).strip()
        branch = subprocess.check_output(['git','rev-parse','--abbrev-ref','HEAD'],cwd=str(ROOT), text=True).strip()
    except Exception:
        head = branch = 'unknown'

    rd = phase1 and {
        'run_id': run_id,
        'run_calls': phase1['stats']['run_calls'],
        'skip_pilot': phase1['stats']['skip_pilot'],
        'skip_valid_full': phase1['stats']['skip_valid_full'],
        'skip_resume': phase1['stats']['skip_resume'],
        'success_new': phase1['stats']['success'],
        'fail_api': phase1['stats']['fail_api'],
        'fail_atomic_save': phase1['stats']['fail_atomic_save'],
        'failures': phase1['failures'][:20],
    }
    report = {
        'task_id': 'TASK-KTO-DETAIL-IMAGE-RAW-BATCH-V1',
        'report_type': 'COMPLETION', 'verdict': verdict,
        'generated_at': now_iso(), 'dry_run': DRY_RUN,
        'git': {'branch': branch, 'head': head},
        'manifest': {'path': str(MANIFEST_PATH.relative_to(ROOT)),
                     'total': manifest['total'],
                     'candidates_sha256': manifest['candidates_sha256']},
        'call_limit': phase1['limit_cfg'] if phase1 else {},
        'api_call_tracking': {
            'run_calls': run_entry['run_calls'],
            'total_calls_all_runs': sum(r.get('run_calls', 0) for r in runs_log['runs']),
            'limit_reached': limit_r,
            'limit_reached_at_cid': phase1['stats']['limit_reached_at'] if phase1 else None,
            'remaining_after_limit': (EXPECTED_COUNT - verify['valid']) if limit_r else 0,
        },
        'phase2_verification': {
            'total_target': EXPECTED_COUNT, 'valid_files': verify['valid'],
            'invalid_files': verify['invalid'], 'pass_all_checks': verify['pass'],
            'checks_applied': ['JSON 파싱 성공', 'response 키 존재', 'resultCode=0000',
                               'response.body 존재', 'contentid 일치'],
            'image_field_stats': {'with_images': verify['with_images'],
                                  'no_images': verify['no_images']},
            'error_groups': verify['error_groups'], 'invalid_sample': verify['invalid_list'][:10],
        },
        'run_detail': rd,
        'partial_limit_reached_next_step': (
            f'PARTIAL_LIMIT_REACHED: {EXPECTED_COUNT-verify["valid"]}건 미완료. 다음 날 --resume 재개.'
        ) if limit_r else None,
        'sha_manifest_path': verify['sha_manifest'],
        'safety_checks': {
            'enriched_candidates_modified': False, 'source_facts_modified': False,
            'flags_modified': False, 'api_key_logged': False,
            'push_performed': False, 'git_add_A_used': False,
            'pilot_files_overwritten': False,
            'detailCommon2_recalled': False, 'detailIntro2_recalled': False,
        },
    }
    write_json(REPORT_PATH, report)
    return report

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    runs_log = load_runs_log()
    run_id   = f'run_{len(runs_log["runs"]) + 1}'
    print('=' * 70)
    print(f'TASK-KTO-DETAIL-IMAGE-RAW-BATCH-V1  [{run_id}]')
    print(f'  dry_run={DRY_RUN}  resume={RESUME}  verify_only={VERIFY_ONLY}')
    print('=' * 70)

    manifest = phase0_manifest()

    if VERIFY_ONLY:
        print('[VERIFY-ONLY] Phase 1 건너뜀'); phase1_result = None
    else:
        phase1_result = phase1_collect(manifest, run_id)

    print('\n[PHASE 2] 완전성 검증...')
    verify = phase2_verify(manifest)
    print(f'  valid={verify["valid"]}/{verify["total"]}  invalid={verify["invalid"]}  '
          f'with_images={verify["with_images"]}  no_images={verify["no_images"]}')
    if verify['error_groups']:
        print(f'  오류 유형: {verify["error_groups"]}')

    report = phase3_report(manifest, phase1_result, verify, run_id)
    print()
    print('=' * 70)
    print(f'VERDICT: {report["verdict"]}')
    v = report['phase2_verification']
    print(f'  valid={v["valid_files"]}/{EXPECTED_COUNT}  invalid={v["invalid_files"]}')
    ct = report['api_call_tracking']
    rd = report.get('run_detail') or {}
    print(f'  run_calls={ct["run_calls"]}  total_all_runs={ct["total_calls_all_runs"]}')
    print(f'  LIMIT_REACHED={ct["limit_reached"]}')
    print(f'  skip_pilot={rd.get("skip_pilot",0)}  success={rd.get("success_new",0)}  '
          f'fail={rd.get("fail_api",0)+rd.get("fail_atomic_save",0)}')
    print(f'  report → {REPORT_PATH.relative_to(ROOT)}')
    print('=' * 70)

if __name__ == '__main__':
    main()
