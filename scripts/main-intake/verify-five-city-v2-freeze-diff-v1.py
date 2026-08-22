#!/usr/bin/env python3
"""
TASK-GYEONGJU-FOOD-105-FIVE-CITY-REINTEGRATION-PREP-V1 — diff allowlist between v1 (R2 historical plan) and v2 (new plan).

Allowed semantic changes: Gyeongju Food slice (GJ08 102 → VG 105 and derived rows), Seoul description/desc_l10n (34fdde0 final-freeze).
Everything else (Busan · Jeju · Jeonju · Gyeongju Attraction rows; Seoul non-description fields; identities) must be byte-equal.
READ-ONLY. Exit 1 on unapproved diff.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from five_city_core_lib import PACKAGE_DIR, REPO  # noqa: E402

V1 = os.path.join(REPO, "data", "main-intake", "five-city-core-v1"); V2 = os.path.join(REPO, "data", "main-intake", PACKAGE_DIR)
SEOUL_DESC_FIELDS = {"description", "desc_l10n"}


def jsonl(p: str) -> list[dict]:
    return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]


def by_cid(rows: list[dict]) -> dict[str, dict]:
    return {r["canonical_id"]: r for r in rows}


def main() -> int:
    a1 = by_cid(jsonl(os.path.join(V1, "five-city-core-active-v1.jsonl"))); a2 = by_cid(jsonl(os.path.join(V2, "five-city-core-active-v1.jsonl")))
    s1 = jsonl(os.path.join(V1, "five-city-core-sources-v1.jsonl")); s2 = jsonl(os.path.join(V2, "five-city-core-sources-v1.jsonl"))
    i1 = jsonl(os.path.join(V1, "five-city-core-images-v1.jsonl")); i2 = jsonl(os.path.join(V2, "five-city-core-images-v1.jsonl"))
    x1 = by_cid(jsonl(os.path.join(V1, "five-city-core-crosswalk-v1.jsonl"))); x2 = by_cid(jsonl(os.path.join(V2, "five-city-core-crosswalk-v1.jsonl")))
    unapproved: list[str] = []; stats: Counter = Counter()
    is_gj08 = lambda c: c.startswith("gyeongju-GJ08-"); is_vg = lambda c: c.startswith("gyeongju-VG08-")
    # removed / added canonicals
    removed = sorted(set(a1) - set(a2)); added = sorted(set(a2) - set(a1))
    if any(not is_gj08(c) for c in removed): unapproved.append(f"removed non-GJ08: {[c for c in removed if not is_gj08(c)][:5]}")
    if any(not is_vg(c) for c in added): unapproved.append(f"added non-VG08: {[c for c in added if not is_vg(c)][:5]}")
    stats["removed_gj08"] = sum(1 for c in removed if is_gj08(c)); stats["added_vg08"] = sum(1 for c in added if is_vg(c))
    # common rows: frozen cities must be identical; seoul may differ only in description/desc_l10n
    for cid in sorted(set(a1) & set(a2)):
        r1, r2 = a1[cid], a2[cid]
        diff = sorted(k for k in set(r1) | set(r2) if r1.get(k) != r2.get(k))
        if not diff: stats[f"identical_{r1['city']}"] += 1; continue
        if r1["city"] == "seoul" and set(diff) <= SEOUL_DESC_FIELDS: stats["seoul_description_changed"] += 1; continue
        unapproved.append(f"{cid}: {diff}")
    # crosswalk decisions for common rows unchanged (identity/main id frozen)
    for cid in sorted(set(x1) & set(x2)):
        if is_gj08(cid): continue
        d1, d2 = x1[cid], x2[cid]
        if (d1["decision"], d1["main_city_spot_id"], d1["service_status"]) != (d2["decision"], d2["main_city_spot_id"], d2["service_status"]):
            unapproved.append(f"crosswalk {cid}: {d1['decision']}/{d1['main_city_spot_id']} → {d2['decision']}/{d2['main_city_spot_id']}")
    # sources / images: rows for frozen canonicals identical as sets
    key_s = lambda s: (s["canonical_id"], s["source_type"], s["source_key"], s["is_primary"], s.get("source_url"), s.get("source_tier"), s.get("candidate_id"))
    f1 = {key_s(s) for s in s1 if not is_gj08(s["canonical_id"])}; f2 = {key_s(s) for s in s2 if not is_vg(s["canonical_id"])}
    if f1 != f2: unapproved.append(f"frozen source rows differ: -{len(f1 - f2)} +{len(f2 - f1)}")
    key_i = lambda i: (i["canonical_id"], i["image_url"], i["rights_status"], i["display_eligible"], i["is_primary"], i["sort_order"])
    g1 = {key_i(i) for i in i1 if not is_gj08(i["canonical_id"])}; g2 = {key_i(i) for i in i2 if not is_vg(i["canonical_id"])}
    if g1 != g2: unapproved.append(f"frozen image rows differ: -{len(g1 - g2)} +{len(g2 - g1)}")
    stats["gj08_sources_removed"] = sum(1 for s in s1 if is_gj08(s["canonical_id"])); stats["vg_sources_added"] = sum(1 for s in s2 if is_vg(s["canonical_id"]))
    stats["gj08_images_removed"] = sum(1 for i in i1 if is_gj08(i["canonical_id"])); stats["vg_images_added"] = sum(1 for i in i2 if is_vg(i["canonical_id"]))
    out = {"stats": dict(stats), "unapproved_diff_count": len(unapproved), "unapproved": unapproved[:20]}
    print(json.dumps(out, ensure_ascii=False))
    return 1 if unapproved else 0


if __name__ == "__main__":
    sys.exit(main())
