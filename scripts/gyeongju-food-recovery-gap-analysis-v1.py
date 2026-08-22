"""
Gap analysis: why 95 canonical food records don't match any VG entity.
Produces per-record reason classification.
"""
import json
import re
import difflib
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
VG_RAW_PATH   = ROOT / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
CANONICAL_PATH = ROOT / "data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl"
OUT_DIR = ROOT / "data/gyeongju-food-multilingual-recovery-v1"

def norm_phone(p):
    if not p: return None
    digits = re.sub(r"[^0-9]", "", str(p))
    if digits.startswith("82") and len(digits) > 9:
        digits = "0" + digits[2:]
    return digits if digits else None

def norm_title(t):
    if not t: return None
    t = t.strip()
    t = re.sub(r"[\s　]+", " ", t).strip()
    return t.lower()

vg_records = []
with open(VG_RAW_PATH, encoding="utf-8") as f:
    for line in f:
        if line.strip():
            vg_records.append(json.loads(line))

canonical_food = []
with open(CANONICAL_PATH, encoding="utf-8") as f:
    for line in f:
        if not line.strip(): continue
        rec = json.loads(line)
        if rec.get("category") == "food" or rec.get("candidate_id","").startswith("gyeongju-GJ08-"):
            canonical_food.append(rec)

# Known matched
matched_cids = {
    "gyeongju-GJ08-405","gyeongju-GJ08-7128","gyeongju-GJ08-732",
    "gyeongju-GJ08-733","gyeongju-GJ08-7510","gyeongju-GJ08-760",
    "gyeongju-GJ08-87"
}
matched_vg_ids = {
    "535f4040060509400a4903494651464c4d","535f40400604084d0b4901454d51454c4e",
    "535f40400604084d0b4305454d5142404d","535f40400605094c0d4204474c51434d4a",
    "535f40400605094c0a4702424351404c4f","535f40400604084d0a48034645514b4741",
    "535f4040070f09400a460142465147474e"
}

# VG not yet matched
vg_unmatched = [v for v in vg_records if v["vg_id"] not in matched_vg_ids]
print(f"VG unmatched: {len(vg_unmatched)}")

# All VG phones
vg_phones = {norm_phone(v["ko"]["phone"]): v for v in vg_records}
vg_phones_set = set(vg_phones.keys()) - {None}

# All VG titles
vg_titles = {norm_title(v["ko"]["title"]): v for v in vg_records}

# Canonical NO_MATCH
canonical_nomatch = [c for c in canonical_food if c["candidate_id"] not in matched_cids]
print(f"Canonical NO_MATCH: {len(canonical_nomatch)}")

# Check PHONE NEAR-MATCH: canonical phone digit string appears as VG phone digit string
# This covers 010 / 0507 / 0504 variant formatting issues
print("\n=== Phone cross-check ===")
phone_in_vg_raw = 0
phone_not_in_vg = 0
for can in canonical_nomatch:
    cp = norm_phone(can.get("phone"))
    if cp and cp in vg_phones_set:
        phone_in_vg_raw += 1
        vg = vg_phones[cp]
        print(f"  PHONE_IN_VG: {can['candidate_id']} ({can.get('title_ko')}) -> vg_id={vg['vg_id']} vg_title={vg['ko']['title']}")
    else:
        phone_not_in_vg += 1

print(f"Phone in VG: {phone_in_vg_raw}")
print(f"Phone NOT in VG: {phone_not_in_vg}")
print(f"No phone (canonical): {sum(1 for c in canonical_nomatch if not c.get('phone'))}")

# Check TITLE near-match
print("\n=== Title near-match (difflib >=0.8) ===")
near_title_count = 0
vg_title_list = [(norm_title(v["ko"]["title"]), v) for v in vg_unmatched]
for can in canonical_nomatch:
    ct = norm_title(can.get("title_ko",""))
    if not ct: continue
    best_ratio = 0
    best_vg = None
    for vt, vg in vg_title_list:
        if not vt: continue
        r = difflib.SequenceMatcher(None, ct, vt).ratio()
        if r > best_ratio:
            best_ratio = r
            best_vg = vg
    if best_ratio >= 0.8:
        print(f"  NEAR_TITLE: {can['candidate_id']} '{can.get('title_ko')}' -> '{best_vg['ko']['title']}' (ratio={best_ratio:.2f})")
        near_title_count += 1

print(f"Near-title matches (>=0.8): {near_title_count}")

# Classify NO_MATCH reasons
print("\n=== NO_MATCH reason classification ===")
reason_counts = defaultdict(int)
reason_details = []
for can in canonical_nomatch:
    cp = norm_phone(can.get("phone"))
    ct = norm_title(can.get("title_ko",""))
    title_ko = can.get("title_ko","")

    reasons = []

    # Is this a market/communal place (성동시장, 중앙시장)
    if any(x in title_ko for x in ["시장", "골목", "촌", "단지"]):
        reasons.append("MARKET_OR_COLLECTIVE")

    # Is this a chain/branch
    if any(x in title_ko for x in ["점", "지점", "본점", "경주점"]) and "경주" in title_ko:
        reasons.append("CHAIN_BRANCH_NON_UNIQUE")

    # No phone → hard to match
    if not cp:
        reasons.append("NO_PHONE_IN_CANONICAL")
    elif cp not in vg_phones_set:
        reasons.append("PHONE_NOT_IN_VG")

    # Title check
    if ct and ct in vg_titles:
        reasons.append("TITLE_IN_VG_BUT_PHONE_MISMATCH")

    # Fuzzy title check with unmatched VG
    best_ratio = max((difflib.SequenceMatcher(None, ct, vt).ratio() for vt, _ in vg_title_list if vt), default=0) if ct else 0
    if best_ratio >= 0.85:
        reasons.append(f"FUZZY_TITLE_CANDIDATE_ratio={best_ratio:.2f}")
    elif best_ratio >= 0.7:
        reasons.append(f"FUZZY_TITLE_WEAK_ratio={best_ratio:.2f}")

    if not reasons:
        reasons.append("NOT_IN_VG_COVERAGE")

    primary = reasons[0] if reasons else "NOT_IN_VG_COVERAGE"
    for r in reasons:
        reason_counts[r] += 1
    reason_details.append({
        "candidate_id": can["candidate_id"],
        "title_ko": can.get("title_ko"),
        "phone": can.get("phone"),
        "district": can.get("district"),
        "reasons": reasons,
        "primary_reason": primary,
    })

for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
    print(f"  {reason}: {count}")

# District distribution for NO_MATCH
print("\n=== NO_MATCH by district ===")
dist_counts = defaultdict(int)
for d in reason_details:
    dist_counts[d.get("district","??")] += 1
for dist, cnt in sorted(dist_counts.items(), key=lambda x: -x[1]):
    print(f"  {dist}: {cnt}")

# VG areas
print("\n=== VG unmatched by area ===")
vg_area_counts = defaultdict(int)
for v in vg_unmatched:
    vg_area_counts[v["area"]] += 1
for area, cnt in sorted(vg_area_counts.items(), key=lambda x: -x[1]):
    print(f"  {area}: {cnt}")

# Save reason details
out_path = OUT_DIR / "gyeongju-food-nomatch-reason-analysis-v1.jsonl"
with open(out_path, "w", encoding="utf-8") as f:
    for d in reason_details:
        f.write(json.dumps(d, ensure_ascii=False) + "\n")
print(f"\nReason analysis written: {out_path}")

# VG unmatched title list (for visual inspection)
print("\n=== VG UNMATCHED records (98) - titles ===")
for v in vg_unmatched[:50]:
    print(f"  {v['vg_id'][:16]}... area={v['area']:10s} ko={v['ko']['title']:25s} en={v['en']['title']}")
