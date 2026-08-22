"""
Investigate specific cases:
1. GJ08-6917 화수브루어리 - exact title match, phone collision
2. TITLE_IN_VG_BUT_PHONE_MISMATCH case
3. District field in food canonicals
4. 올바릇 식당 vs 올바릇식당 경주점 (near match)
5. Show sample food canonical keys
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
VG_RAW_PATH   = ROOT / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"
CANONICAL_PATH = ROOT / "data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl"

def norm_phone(p):
    if not p: return None
    digits = re.sub(r"[^0-9]", "", str(p))
    if digits.startswith("82") and len(digits) > 9:
        digits = "0" + digits[2:]
    return digits if digits else None

def norm_title(t):
    if not t: return None
    return re.sub(r"[\s　]+", " ", t.strip()).lower()

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

# 1. GJ08-6917 phone
can_6917 = next((c for c in canonical_food if c["candidate_id"] == "gyeongju-GJ08-6917"), None)
phone_6917 = norm_phone(can_6917.get("phone")) if can_6917 else None
print(f"=== GJ08-6917 ===")
print(f"  canonical title: {can_6917.get('title_ko')}, phone: {can_6917.get('phone')} -> norm: {phone_6917}")
print(f"  address: {can_6917.get('address')}")
vg_6917_phone_hits = [v for v in vg_records if norm_phone(v["ko"]["phone"]) == phone_6917]
print(f"  VG records with same phone: {len(vg_6917_phone_hits)}")
for v in vg_6917_phone_hits:
    print(f"    vg_id={v['vg_id']} title={v['ko']['title']} area={v['area']} phone={v['ko']['phone']}")

# Also find VG by title
vg_hwasu = [v for v in vg_records if "화수" in v["ko"].get("title","")]
print(f"  VG records with '화수' in title: {len(vg_hwasu)}")
for v in vg_hwasu:
    print(f"    vg_id={v['vg_id']} title={v['ko']['title']} area={v['area']} phone={v['ko']['phone']}")

# 2. TITLE_IN_VG_BUT_PHONE_MISMATCH case
print(f"\n=== TITLE_IN_VG_BUT_PHONE_MISMATCH ===")
vg_titles = {norm_title(v["ko"]["title"]): v for v in vg_records}
for can in canonical_food:
    ct = norm_title(can.get("title_ko",""))
    if ct in vg_titles:
        vg = vg_titles[ct]
        cp = norm_phone(can.get("phone"))
        vp = norm_phone(vg["ko"]["phone"])
        if cp != vp:
            print(f"  {can['candidate_id']} title={can['title_ko']} can_phone={can.get('phone')} vg_phone={vg['ko']['phone']}")
            print(f"    norm: can={cp} vg={vp}")

# 3. District in food canonicals
print(f"\n=== District/category field in food canonical ===")
sample_food = [c for c in canonical_food if c["candidate_id"].startswith("gyeongju-GJ08-")][:3]
for c in sample_food:
    keys = list(c.keys())
    print(f"  {c['candidate_id']}: category={c.get('category')}, district={c.get('district')}, subcategory={c.get('subcategory')}")
    print(f"    Keys: {keys}")

# 4. 올바릇 match
print(f"\n=== 올바릇 match ===")
can_7124 = next((c for c in canonical_food if c["candidate_id"] == "gyeongju-GJ08-7124"), None)
vg_olba = [v for v in vg_records if "올바릇" in v["ko"].get("title","")]
print(f"  Canonical GJ08-7124: {can_7124.get('title_ko') if can_7124 else '?'} phone={can_7124.get('phone') if can_7124 else '?'}")
for v in vg_olba:
    print(f"  VG: vg_id={v['vg_id']} title={v['ko']['title']} area={v['area']} phone={v['ko']['phone']}")

# 5. 소담 vs 소담루
print(f"\n=== 소담 vs 소담루 ===")
can_412 = next((c for c in canonical_food if c["candidate_id"] == "gyeongju-GJ08-412"), None)
vg_sodam = [v for v in vg_records if "소담" in v["ko"].get("title","")]
print(f"  Canonical GJ08-412: {can_412.get('title_ko') if can_412 else '?'} phone={can_412.get('phone') if can_412 else '?'}")
print(f"  address: {can_412.get('address') if can_412 else '?'}")
for v in vg_sodam:
    print(f"  VG: title={v['ko']['title']} area={v['area']} phone={v['ko']['phone']} addr={v['ko']['address']}")

# 6. 맷돌순두부 investigation
print(f"\n=== 맷돌순두부 investigation ===")
can_112 = next((c for c in canonical_food if c["candidate_id"] == "gyeongju-GJ08-112"), None)
can_88  = next((c for c in canonical_food if c["candidate_id"] == "gyeongju-GJ08-88"), None)
vg_maet = [v for v in vg_records if "맷돌" in v["ko"].get("title","")]
print(f"  GJ08-112 (황남맷돌순두부): phone={can_112.get('phone') if can_112 else '?'}, addr={can_112.get('address') if can_112 else '?'}")
print(f"  GJ08-88  (전통맷돌순두부): phone={can_88.get('phone') if can_88 else '?'}, addr={can_88.get('address') if can_88 else '?'}")
for v in vg_maet:
    print(f"  VG: title={v['ko']['title']} area={v['area']} phone={v['ko']['phone']} addr={v['ko']['address']}")

# 7. 보문호반오리 vs 호반오리
print(f"\n=== 보문호반오리 vs 호반오리 ===")
can_85 = next((c for c in canonical_food if c["candidate_id"] == "gyeongju-GJ08-85"), None)
vg_hoban = [v for v in vg_records if "호반오리" in v["ko"].get("title","") or "오리" in v["ko"].get("title","")]
print(f"  GJ08-85 (보문호반오리): phone={can_85.get('phone') if can_85 else '?'}, addr={can_85.get('address') if can_85 else '?'}")
for v in vg_hoban:
    print(f"  VG: title={v['ko']['title']} area={v['area']} phone={v['ko']['phone']} addr={v['ko']['address']}")
