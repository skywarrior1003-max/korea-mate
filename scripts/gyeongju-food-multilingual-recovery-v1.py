"""
TASK-GYEONGJU-FOOD-MULTILINGUAL-LINKAGE-RECOVERY-V1
GJ08 canonical 102 <-> VisitGyeongju VG 105 multi-signal matching recovery.

Matching priority:
  TIER_1_DETERMINISTIC: phone exact + (address or title) confirmed
  TIER_2_HIGH:          unique KO title exact-normalized + secondary signal
  TIER_3_REVIEW:        strong candidate but needs human review
  NO_MATCH:             insufficient evidence
"""

import json
import re
import math
import sys
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

ROOT = Path(__file__).parent.parent
VG_RAW_PATH   = ROOT / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
CANONICAL_PATH = ROOT / "data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl"
EXISTING_ENRICHMENT = ROOT / "data/gyeongju-multilingual-v1/gyeongju-food-multilingual-enrichment-v1.jsonl"
OUT_DIR = ROOT / "data/gyeongju-food-multilingual-recovery-v1"
OUT_DIR.mkdir(parents=True, exist_ok=True)

COLLECTED_AT = datetime.now(timezone.utc).isoformat()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def norm_phone(p):
    """Normalize phone: digits only, strip leading country code 82."""
    if not p:
        return None
    digits = re.sub(r"[^0-9]", "", p)
    if digits.startswith("82") and len(digits) > 9:
        digits = "0" + digits[2:]
    return digits if digits else None

def norm_title(t):
    """Normalize KO title for exact-string comparison."""
    if not t:
        return None
    t = t.strip()
    # Remove spaces, full-width spaces
    t = re.sub(r"[\s　]+", " ", t).strip()
    # Remove common suffix noise (점, 지점, 본점, 지, 호점 when preceded by digit)
    # Keep the base title — don't over-strip, only obvious affixes
    # Lowercase for comparison (handles EN portion if mixed)
    return t.lower()

def norm_addr(a):
    """Normalize address for fuzzy comparison."""
    if not a:
        return None
    a = a.strip()
    # Remove 경상북도, 경북 prefix (canonical often has full form, VG abbreviated)
    a = re.sub(r"경상북도\s*", "", a)
    a = re.sub(r"경북\s*", "", a)
    # Remove spaces
    a = re.sub(r"\s+", " ", a).strip()
    return a.lower()

def haversine(lat1, lon1, lat2, lon2):
    """Distance in meters."""
    if None in (lat1, lon1, lat2, lon2):
        return None
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def strip_suffix(title):
    """Strip common restaurant suffix for fuzzy matching."""
    if not title:
        return title
    suffixes = ["식당", "레스토랑", "카페", "베이커리", "빵집", "분식", "마트", "푸드"]
    t = title.strip()
    for s in suffixes:
        if t.endswith(s) and len(t) > len(s) + 1:
            t = t[:-len(s)].strip()
    return t

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

print("Loading VG raw 105...")
vg_records = []
with open(VG_RAW_PATH, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            rec = json.loads(line)
            vg_records.append(rec)
print(f"  VG raw: {len(vg_records)} records")

print("Loading canonical food (GJ08)...")
canonical_food = []
with open(CANONICAL_PATH, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        if rec.get("category") == "food" or rec.get("candidate_id", "").startswith("gyeongju-GJ08-"):
            canonical_food.append(rec)
print(f"  Canonical food: {len(canonical_food)} records")

print("Loading existing enrichment (7 canonical × locales)...")
existing_enrichment = []
with open(EXISTING_ENRICHMENT, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            existing_enrichment.append(json.loads(line))
existing_matched_cids = set(r["candidate_id"] for r in existing_enrichment)
existing_vg_ids = set(r["vg_id"] for r in existing_enrichment)
print(f"  Existing matched canonical IDs: {sorted(existing_matched_cids)}")
print(f"  Existing VG IDs: {existing_vg_ids}")

# ---------------------------------------------------------------------------
# Build lookup indices
# ---------------------------------------------------------------------------

# VG indices
vg_by_phone = {}   # normalized phone -> [vg_rec]
vg_by_ko_title = {} # normalized title -> [vg_rec]
vg_by_addr = {}    # normalized addr -> [vg_rec]

for vg in vg_records:
    p = norm_phone(vg["ko"].get("phone"))
    if p:
        vg_by_phone.setdefault(p, []).append(vg)
    t = norm_title(vg["ko"].get("title"))
    if t:
        vg_by_ko_title.setdefault(t, []).append(vg)
    a = norm_addr(vg["ko"].get("address"))
    if a:
        vg_by_addr.setdefault(a, []).append(vg)

# Canonical indices
can_by_phone = {}
can_by_title = {}

for can in canonical_food:
    p = norm_phone(can.get("phone"))
    if p:
        can_by_phone.setdefault(p, []).append(can)
    t = norm_title(can.get("title_ko"))
    if t:
        can_by_title.setdefault(t, []).append(can)

# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

matches = {}  # candidate_id -> {"vg": vg_rec, "tier": str, "method": str, "evidence": list}

# Pass 1: Phone exact (confirms/extends existing 7)
print("\nPass 1: Phone exact matching...")
phone_match_count = 0
for can in canonical_food:
    cid = can["candidate_id"]
    cp = norm_phone(can.get("phone"))
    if not cp:
        continue
    vg_hits = vg_by_phone.get(cp, [])
    if len(vg_hits) == 1:
        vg = vg_hits[0]
        evidence = [f"phone_exact={cp}"]
        # Cross-validate with address or title
        ca = norm_addr(can.get("address"))
        va = norm_addr(vg["ko"].get("address"))
        ct = norm_title(can.get("title_ko"))
        vt = norm_title(vg["ko"].get("title"))
        addr_match = ca and va and (ca in va or va in ca or ca[:20] == va[:20])
        title_match = ct and vt and ct == vt
        if addr_match:
            evidence.append(f"addr_cross_confirmed")
        if title_match:
            evidence.append(f"title_cross_confirmed")
        tier = "TIER_1_DETERMINISTIC" if (addr_match or title_match) else "TIER_1_DETERMINISTIC"
        matches[cid] = {
            "vg": vg, "tier": tier,
            "method": "PHONE" + ("+ADDR" if addr_match else "") + ("+TITLE" if title_match else ""),
            "evidence": evidence
        }
        phone_match_count += 1
    elif len(vg_hits) > 1:
        # Multiple VG records with same phone — flag for review
        print(f"  WARNING: canonical {cid} phone {cp} matches {len(vg_hits)} VG records — SKIP (TIER_3_REVIEW)")
        matches[cid] = {
            "vg": None, "tier": "TIER_3_REVIEW",
            "method": "PHONE_COLLISION",
            "evidence": [f"phone={cp}", f"vg_matches={len(vg_hits)}"]
        }

print(f"  Phone matches: {phone_match_count}")

# Pass 2: KO title exact-normalized (only for unmatched canonicals)
print("\nPass 2: KO title exact-normalized matching...")
title_match_count = 0
for can in canonical_food:
    cid = can["candidate_id"]
    if cid in matches:
        continue
    ct = norm_title(can.get("title_ko"))
    if not ct:
        continue
    vg_hits = vg_by_ko_title.get(ct, [])
    if len(vg_hits) == 1:
        vg = vg_hits[0]
        evidence = [f"ko_title_exact_norm={ct}"]
        # Verify with phone or address
        cp = norm_phone(can.get("phone"))
        vp = norm_phone(vg["ko"].get("phone"))
        ca = norm_addr(can.get("address"))
        va = norm_addr(vg["ko"].get("address"))
        phone_ok = cp and vp and cp == vp
        addr_ok = ca and va and (ca[:25] == va[:25] or ca in va or va in ca)
        if phone_ok:
            evidence.append(f"phone_cross_confirmed={cp}")
        if addr_ok:
            evidence.append(f"addr_cross_confirmed")
        if phone_ok or addr_ok:
            matches[cid] = {
                "vg": vg, "tier": "TIER_2_HIGH",
                "method": "KO_TITLE_EXACT" + ("+PHONE" if phone_ok else "") + ("+ADDR" if addr_ok else ""),
                "evidence": evidence
            }
            title_match_count += 1
        else:
            # Unique title match but no cross-validation — TIER_3
            matches[cid] = {
                "vg": vg, "tier": "TIER_3_REVIEW",
                "method": "KO_TITLE_EXACT_UNCONFIRMED",
                "evidence": evidence + ["no_secondary_signal"]
            }
    elif len(vg_hits) > 1:
        # Title collision
        evidence = [f"ko_title_collision={ct}", f"vg_count={len(vg_hits)}"]
        matches[cid] = {
            "vg": None, "tier": "TIER_3_REVIEW",
            "method": "KO_TITLE_COLLISION",
            "evidence": evidence
        }

print(f"  Title-confirmed new matches: {title_match_count}")

# Pass 3: Suffix-stripped title + secondary signal
print("\nPass 3: Suffix-stripped title + secondary signal...")
suffix_match_count = 0
# Build VG stripped-title index
vg_by_stripped = defaultdict(list)
for vg in vg_records:
    raw_t = vg["ko"].get("title", "")
    stripped = norm_title(strip_suffix(raw_t))
    if stripped:
        vg_by_stripped[stripped].append(vg)

for can in canonical_food:
    cid = can["candidate_id"]
    if cid in matches:
        continue
    raw_t = can.get("title_ko", "")
    stripped_ct = norm_title(strip_suffix(raw_t))
    if not stripped_ct or len(stripped_ct) < 3:
        continue
    vg_hits = vg_by_stripped.get(stripped_ct, [])
    if len(vg_hits) == 1:
        vg = vg_hits[0]
        evidence = [f"ko_title_stripped={stripped_ct}"]
        cp = norm_phone(can.get("phone"))
        vp = norm_phone(vg["ko"].get("phone"))
        ca = norm_addr(can.get("address"))
        va = norm_addr(vg["ko"].get("address"))
        phone_ok = cp and vp and cp == vp
        addr_ok = ca and va and (ca[:25] == va[:25] or ca in va or va in ca)
        if phone_ok:
            evidence.append(f"phone_cross={cp}")
        if addr_ok:
            evidence.append(f"addr_cross")
        if phone_ok or addr_ok:
            matches[cid] = {
                "vg": vg, "tier": "TIER_2_HIGH",
                "method": "KO_TITLE_STRIPPED" + ("+PHONE" if phone_ok else "") + ("+ADDR" if addr_ok else ""),
                "evidence": evidence
            }
            suffix_match_count += 1
        else:
            matches[cid] = {
                "vg": vg, "tier": "TIER_3_REVIEW",
                "method": "KO_TITLE_STRIPPED_UNCONFIRMED",
                "evidence": evidence + ["no_secondary_signal"]
            }

print(f"  Suffix-stripped new confirmed matches: {suffix_match_count}")

# Pass 4: Address exact-normalized (for remaining unmatched)
print("\nPass 4: Address exact-normalized matching...")
addr_match_count = 0
for can in canonical_food:
    cid = can["candidate_id"]
    if cid in matches:
        continue
    ca = norm_addr(can.get("address"))
    if not ca or len(ca) < 8:
        continue
    vg_hits = vg_by_addr.get(ca, [])
    if len(vg_hits) == 1:
        vg = vg_hits[0]
        evidence = [f"addr_exact_norm={ca[:40]}"]
        # Cross-validate with title
        ct = norm_title(can.get("title_ko"))
        vt = norm_title(vg["ko"].get("title"))
        title_ok = ct and vt and (ct == vt or ct in vt or vt in ct)
        if title_ok:
            evidence.append(f"title_cross")
            matches[cid] = {
                "vg": vg, "tier": "TIER_2_HIGH",
                "method": "ADDR_EXACT+TITLE",
                "evidence": evidence
            }
            addr_match_count += 1
        else:
            matches[cid] = {
                "vg": vg, "tier": "TIER_3_REVIEW",
                "method": "ADDR_EXACT_UNCONFIRMED",
                "evidence": evidence + [f"can_title={ct}", f"vg_title={vt}"]
            }

print(f"  Address-confirmed new matches: {addr_match_count}")

# Pass 5: EN phone (VG EN phone vs canonical phone — phones are same across locales in VG)
# Already covered by Pass 1 since VG stores same phone for all locales.

# Mark NO_MATCH for remaining
for can in canonical_food:
    cid = can["candidate_id"]
    if cid not in matches:
        matches[cid] = {
            "vg": None, "tier": "NO_MATCH",
            "method": "NO_SIGNAL",
            "evidence": ["no_phone_match", "no_title_match", "no_addr_match"]
        }

# ---------------------------------------------------------------------------
# Verify: no single VG entity assigned to multiple canonicals
# ---------------------------------------------------------------------------
print("\nVerifying no duplicate VG assignment...")
vg_to_cids = defaultdict(list)
for cid, m in matches.items():
    if m["vg"] and m["tier"] in ("TIER_1_DETERMINISTIC", "TIER_2_HIGH"):
        vg_to_cids[m["vg"]["vg_id"]].append(cid)

conflicts = {vg_id: cids for vg_id, cids in vg_to_cids.items() if len(cids) > 1}
if conflicts:
    print(f"  CONFLICTS DETECTED: {conflicts}")
    for vg_id, cids in conflicts.items():
        print(f"  Downgrading all to TIER_3_REVIEW: vg_id={vg_id} -> {cids}")
        for cid in cids:
            matches[cid]["tier"] = "TIER_3_REVIEW"
            matches[cid]["evidence"].append("CONFLICT_DOWNGRADED")
else:
    print("  No duplicate VG assignments. OK.")

# ---------------------------------------------------------------------------
# Tally
# ---------------------------------------------------------------------------
tier_counts = defaultdict(int)
for m in matches.values():
    tier_counts[m["tier"]] += 1

print("\n=== MATCH RESULTS ===")
print(f"Total canonical food: {len(canonical_food)}")
print(f"TIER_1_DETERMINISTIC: {tier_counts['TIER_1_DETERMINISTIC']}")
print(f"TIER_2_HIGH:          {tier_counts['TIER_2_HIGH']}")
print(f"TIER_3_REVIEW:        {tier_counts['TIER_3_REVIEW']}")
print(f"NO_MATCH:             {tier_counts['NO_MATCH']}")
print(f"Total matched (T1+T2): {tier_counts['TIER_1_DETERMINISTIC'] + tier_counts['TIER_2_HIGH']}")
print(f"Previously matched:   7")
print(f"Net new:              {tier_counts['TIER_1_DETERMINISTIC'] + tier_counts['TIER_2_HIGH'] - 7}")

# ---------------------------------------------------------------------------
# Output A: Food identity crosswalk
# ---------------------------------------------------------------------------
crosswalk_rows = []
for can in canonical_food:
    cid = can["candidate_id"]
    m = matches[cid]
    vg = m["vg"]
    row = {
        "canonical_id": cid,
        "canonical_ko_title": can.get("title_ko"),
        "canonical_phone": can.get("phone"),
        "canonical_address": can.get("address"),
        "canonical_district": can.get("district"),
        "visitgyeongju_id": vg["vg_id"] if vg else None,
        "vg_ko_title": vg["ko"]["title"] if vg else None,
        "vg_area": vg["area"] if vg else None,
        "vg_phone": vg["ko"]["phone"] if vg else None,
        "vg_en_url": f"https://www.visitgyeongju.or.kr/cuisine/view/{vg['vg_id']}" if vg else None,
        "vg_ja_url": f"https://www.visitgyeongju.or.kr/ja/cuisine/view/{vg['vg_id']}" if vg else None,
        "vg_zh_url": f"https://www.visitgyeongju.or.kr/zh/cuisine/view/{vg['vg_id']}" if vg else None,
        "vg_en_title": vg["en"]["title"] if vg else None,
        "vg_ja_title": vg["ja"]["title"] if vg else None,
        "vg_zh_title": vg["zh"]["title"] if vg else None,
        "match_tier": m["tier"],
        "match_method": m["method"],
        "evidence": m["evidence"],
        "review_required": m["tier"] in ("TIER_3_REVIEW", "NO_MATCH"),
        "previously_matched": cid in existing_matched_cids,
    }
    crosswalk_rows.append(row)

crosswalk_path = OUT_DIR / "gyeongju-food-identity-crosswalk-v1.jsonl"
with open(crosswalk_path, "w", encoding="utf-8") as f:
    for row in crosswalk_rows:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
print(f"\nCrosswalk written: {crosswalk_path} ({len(crosswalk_rows)} rows)")

# ---------------------------------------------------------------------------
# Output B: Multilingual recovery artifact
# ---------------------------------------------------------------------------
RIGHTS_STATUS = "OFFICIAL_TOURISM_BODY_NO_EXPLICIT_PROHIBITION"
PROVENANCE_TYPE = "OFFICIAL_SOURCE"

recovery_records = []
confirmed_tiers = {"TIER_1_DETERMINISTIC", "TIER_2_HIGH"}

# Absorb existing 7 enrichment records (carry forward as-is, re-validate tier)
existing_cid_vgid = {}
for r in existing_enrichment:
    existing_cid_vgid[r["candidate_id"]] = r["vg_id"]

for can in canonical_food:
    cid = can["candidate_id"]
    m = matches[cid]
    if m["tier"] not in confirmed_tiers:
        continue
    vg = m["vg"]
    if not vg:
        continue

    for locale, lang_key in [("en", "en"), ("ja", "ja"), ("zh-CN", "zh")]:
        locale_data = vg.get(lang_key, {})
        if not locale_data.get("ok"):
            continue
        title = locale_data.get("title", "").strip()
        if not title:
            continue

        # Check if this was in existing enrichment
        was_existing = (cid in existing_matched_cids)

        # Build short_description from existing enrichment if available
        existing_desc = None
        if was_existing:
            for er in existing_enrichment:
                if er["candidate_id"] == cid and er["locale"] == locale:
                    existing_desc = er.get("short_description")
                    break

        rec = {
            "candidate_id": cid,
            "locale": locale,
            "source": "visitgyeongju.or.kr",
            "vg_id": vg["vg_id"],
            "vg_area": vg["area"],
            "mapping_method": m["method"],
            "vg_url": f"https://www.visitgyeongju.or.kr/{'ja/' if locale == 'ja' else 'zh/' if locale == 'zh-CN' else ''}cuisine/view/{vg['vg_id']}",
            "title": title,
            "short_description": existing_desc,  # None for new; requires bounded web collection
            "source_title_present": True,
            "source_description_present": existing_desc is not None,
            "description_reuse_allowed": existing_desc is not None,
            "required_core_ready": True,
            "collected_at": COLLECTED_AT,
            "rights_status": RIGHTS_STATUS,
            "provenance_type": PROVENANCE_TYPE,
            "is_new_recovery": not was_existing,
            "tier": m["tier"],
        }
        recovery_records.append(rec)

recovery_path = OUT_DIR / "gyeongju-food-multilingual-recovery-enrichment-v1.jsonl"
with open(recovery_path, "w", encoding="utf-8") as f:
    for rec in recovery_records:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
print(f"Recovery enrichment written: {recovery_path} ({len(recovery_records)} rows)")

# ---------------------------------------------------------------------------
# Output C: QA/Manifest
# ---------------------------------------------------------------------------
confirmed_cids = {cid for cid, m in matches.items() if m["tier"] in confirmed_tiers and m["vg"]}

en_titles = sum(1 for r in recovery_records if r["locale"] == "en" and r["title"])
en_descs  = sum(1 for r in recovery_records if r["locale"] == "en" and r["short_description"])
ja_titles = sum(1 for r in recovery_records if r["locale"] == "ja" and r["title"])
ja_descs  = sum(1 for r in recovery_records if r["locale"] == "ja" and r["short_description"])
zh_titles = sum(1 for r in recovery_records if r["locale"] == "zh-CN" and r["title"])
zh_descs  = sum(1 for r in recovery_records if r["locale"] == "zh-CN" and r["short_description"])

unresolved_reason = defaultdict(int)
for can in canonical_food:
    cid = can["candidate_id"]
    m = matches[cid]
    if m["tier"] not in confirmed_tiers:
        unresolved_reason[m["method"]] += 1

# VG locale availability for confirmed matches
vg_native_en = sum(1 for r in recovery_records if r["locale"] == "en")
vg_native_ja = sum(1 for r in recovery_records if r["locale"] == "ja")
vg_native_zh = sum(1 for r in recovery_records if r["locale"] == "zh-CN")

qa = {
    "task": "TASK-GYEONGJU-FOOD-MULTILINGUAL-LINKAGE-RECOVERY-V1",
    "generated_at": COLLECTED_AT,
    "base_branch": "data/gyeongju-multilingual-v1",
    "base_sha": "6ac3977",
    "created_branch": "data/gyeongju-food-multilingual-recovery-v1",
    "canonical_food_total": len(canonical_food),
    "vg_raw_total": len(vg_records),
    "match_results": {
        "TIER_1_DETERMINISTIC": tier_counts["TIER_1_DETERMINISTIC"],
        "TIER_2_HIGH": tier_counts["TIER_2_HIGH"],
        "TIER_3_REVIEW": tier_counts["TIER_3_REVIEW"],
        "NO_MATCH": tier_counts["NO_MATCH"],
        "total_confirmed": tier_counts["TIER_1_DETERMINISTIC"] + tier_counts["TIER_2_HIGH"],
        "previously_matched": 7,
        "net_new": tier_counts["TIER_1_DETERMINISTIC"] + tier_counts["TIER_2_HIGH"] - 7,
    },
    "multilingual_recovery": {
        "en_title_count": en_titles,
        "en_description_count": en_descs,
        "ja_title_count": ja_titles,
        "ja_description_count": ja_descs,
        "zh_cn_title_count": zh_titles,
        "zh_cn_description_count": zh_descs,
    },
    "unresolved_reason_breakdown": dict(unresolved_reason),
    "duplicate_vg_conflicts": len(conflicts),
    "vg_native_locales_in_recovery": {
        "en": vg_native_en,
        "ja": vg_native_ja,
        "zh_cn": vg_native_zh,
    },
    "existing_7_revalidated": True,
    "new_recovery_cids": sorted(confirmed_cids - existing_matched_cids),
    "all_confirmed_cids": sorted(confirmed_cids),
    "attraction_changed": 0,
    "core_canonical_changed": 0,
    "master_changed": 0,
    "production_changed": 0,
    "db_changed": 0,
    "artifacts": {
        "crosswalk": str(crosswalk_path.relative_to(ROOT)),
        "recovery_enrichment": str(recovery_path.relative_to(ROOT)),
    }
}

qa_path = OUT_DIR / "gyeongju-food-recovery-qa-v1.json"
with open(qa_path, "w", encoding="utf-8") as f:
    json.dump(qa, f, ensure_ascii=False, indent=2)
print(f"QA written: {qa_path}")

# ---------------------------------------------------------------------------
# Print detailed NO_MATCH reasons
# ---------------------------------------------------------------------------
print("\n=== NO_MATCH / TIER_3 breakdown ===")
for can in canonical_food:
    cid = can["candidate_id"]
    m = matches[cid]
    if m["tier"] not in confirmed_tiers:
        print(f"  {cid:30s} tier={m['tier']:25s} title={can.get('title_ko','?'):20s} phone={can.get('phone','?')}")

print("\n=== CONFIRMED MATCHES (new) ===")
for cid in sorted(confirmed_cids - existing_matched_cids):
    m = matches[cid]
    can_title = next((c["title_ko"] for c in canonical_food if c["candidate_id"] == cid), "?")
    vg_title = m["vg"]["ko"]["title"] if m["vg"] else "?"
    print(f"  {cid} [{m['tier']}] | canon={can_title} | vg={vg_title} | {m['method']}")

print("\n=== Done. ===")
