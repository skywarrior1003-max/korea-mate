#!/usr/bin/env python3
"""
TASK-SEOUL-DESCRIPTION-CORRECTION-V1 — focused verification harness (READ-ONLY on artifacts; writes only a scratch JSON).

Derives the Seoul en/ja/zh descriptions BEFORE (old strip_html path) and AFTER (Owner-approved seoul_description path) from the
pinned Final blobs and reports: style/script affected rows, allowlist dedupe rows, per-row before/after counts, unique-block loss,
length distribution, diff allowlist, place/locale coverage invariants. Does NOT regenerate the five-city intake package.

    python scripts/main-intake/verify-seoul-description-correction-v1.py --out <scratch.json>
    python scripts/main-intake/verify-seoul-description-correction-v1.py --self-test      # SC-1..7 · RD-1..8 · order/determinism
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
from five_city_core_lib import strip_html, strip_code_blocks, visible_text, split_blocks, dedupe_blocks, dedupe_exact_blocks, seoul_description, SEOUL_DEDUPE_ALLOWLIST, BLOCK_DEDUPE_MIN_LEN  # noqa: E402

MANIFEST = os.path.join(ROOT, "data", "main-intake", "five-city-core-v1", "five-city-core-input-manifest-v1.json")
LOCALE_MAP = {"en": "en", "ja": "ja", "zh-CN": "zh"}
STYLE_RE = re.compile(r"<style\b", re.I); SCRIPT_RE = re.compile(r"<script\b", re.I)


def git_show(sha: str, path: str) -> str:
    r = subprocess.run(["git", "show", f"{sha}:{path}"], cwd=ROOT, capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit(f"git show failed: {sha}:{path}")
    return r.stdout


def jsonl(t: str) -> list[dict]:
    return [json.loads(l) for l in t.splitlines() if l.strip()]


def gt(vals: list[int]) -> dict[str, int]:
    return {f">{k}": sum(1 for n in vals if n > k) for k in (5000, 10000, 20000, 50000, 100000)} | {"max": max(vals) if vals else 0}


def run(out_path: str) -> dict:
    m = json.load(open(MANIFEST, encoding="utf-8"))["inputs"]
    can = jsonl(git_show(m["seoul"]["sha"], m["seoul"]["path"])); ml = jsonl(git_show(m["seoul_ml"]["sha"], m["seoul_ml"]["path"]))
    active = [c for c in can if c.get("service_status") == "ACTIVE"]
    byp: dict[str, dict[str, dict]] = {}
    for r in ml:
        loc = LOCALE_MAP.get(r.get("locale") or "")
        if loc and r.get("collection_status") in (None, "OK", "SUCCESS") and r.get("description_reuse_allowed") is not False and (r.get("title") or r.get("short_description")):
            byp.setdefault(str(r.get("canonical_place_id")), {})[loc] = r
    style = Counter(); script = Counter(); dedup_rows = []; changed = Counter(); unapproved = []; nonnull_before = Counter(); nonnull_after = Counter()
    after_len: dict[str, list[int]] = {"en": [], "ja": [], "zh": []}; before_len: dict[str, list[int]] = {"en": [], "ja": [], "zh": []}
    cap_trunc = 0; loss = 0
    for c in active:
        cid = c["candidate_id"]
        for loc in ("en", "ja", "zh"):
            raw = (byp.get(c.get("source_cid") or "", {}).get(loc) or {}).get("short_description")
            if not raw:
                continue
            before = strip_html(raw) or None
            after = seoul_description(cid, loc, raw)
            nonnull_before[loc] += before is not None; nonnull_after[loc] += after is not None
            if before is not None:
                before_len[loc].append(len(before))
            if after is not None:
                after_len[loc].append(len(after))
            has_style = bool(STYLE_RE.search(raw)); has_script = bool(SCRIPT_RE.search(raw))
            style[loc] += has_style; script[loc] += has_script
            in_allow = loc in SEOUL_DEDUPE_ALLOWLIST.get(cid, ())
            if after != before:
                changed[loc] += 1
                if not (has_style or has_script or in_allow):
                    unapproved.append((cid, loc))
            # global cap check: after must equal the code-block-stripped text unless dedupe applied (never truncated by length)
            if not in_allow and after != (visible_text(raw) or None):
                cap_trunc += 1
            if in_allow:
                vis = visible_text(raw); ded, stats = dedupe_exact_blocks(vis)
                blocks_before = split_blocks(vis); kept = dedupe_blocks(blocks_before)
                counted = [b for b in blocks_before if len(b) >= BLOCK_DEDUPE_MIN_LEN]
                # unique official block loss: every distinct counted block must survive (as a kept block AND as a substring of the output text)
                lost = sorted(b for b in set(counted) if b not in kept or re.sub(r"\s+", " ", b) not in ded); loss += len(lost)
                first_order = [b for i, b in enumerate(blocks_before) if b not in blocks_before[:i]]
                order_ok = kept == first_order                      # kept sequence == first-occurrence sequence (all lengths)
                order_in_text = ded == re.sub(r"\s+", " ", " ".join(first_order)).strip()   # output text is exactly the first-occurrence blocks joined
                dedup_rows.append({"canonical_id": cid, "name_ko": c.get("title_ko"), "locale": loc, "before_chars_old_path": len(before or ""), "before_chars_after_code_removal": len(vis), "after_chars": len(ded),
                                   "blocks_before": stats["blocks"], "unique_blocks": stats["unique_blocks"], "duplicates_removed": stats["duplicates_removed"], "kept_blocks_total": len(kept),
                                   "unique_block_loss": len(lost), "first_occurrence_order_preserved": order_ok and order_in_text, "deterministic": dedupe_exact_blocks(vis)[0] == ded, "head": re.sub(r"\s+", " ", ded)[:90]})
    res = {"seoul_final_rows": len(can), "seoul_active_before": len(active), "seoul_active_after": len(active), "place_removed": 0, "place_added": 0, "canonical_identity_changed": 0,
           "style_affected_rows": dict(style), "script_affected_rows": dict(script), "description_changed_rows": dict(changed), "description_changed_rows_total": sum(changed.values()),
           "dedupe_rows": dedup_rows, "dedupe_locale_rows": len(dedup_rows), "dedupe_places": len({r["canonical_id"] for r in dedup_rows}), "unique_official_block_loss": loss,
           "unapproved_description_diffs": unapproved, "global_cap_truncated_rows": cap_trunc,
           "locale_non_null_before": dict(nonnull_before), "locale_non_null_after": dict(nonnull_after), "ko_non_null": sum(1 for c in active if c.get("description_ko")),
           "length_before": {k: gt(v) for k, v in before_len.items()}, "length_after": {k: gt(v) for k, v in after_len.items()}}
    if out_path:
        with open(out_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
    return res


def self_test() -> None:
    # SC-1/2/3/4/5: style/script removal, surrounding visible text kept, attributes/newlines/case
    html = '<div><STYLE type="text/css">\n.se-contents .se-scrollbox{overflow-x: auto;}\n</STYLE><p>Gyeongbokgung is the main palace.</p><script type="application/ld+json">\n{"@context":"https://schema.org"}\n</script><p>Opening hours vary.</p></div>'
    assert visible_text(html) == "Gyeongbokgung is the main palace. Opening hours vary.", visible_text(html)
    assert "overflow" not in visible_text(html) and "schema.org" not in visible_text(html)
    assert strip_code_blocks("<p>a</p><Script a=1\n b=2>x</Script >b") == "<p>a</p> b"
    # SC-6/7: entity decoding unchanged, normal wording unchanged
    normal = "<p>Tom &amp; Jerry &quot;live&quot; show.</p>"
    assert visible_text(normal) == strip_html(normal) == 'Tom & Jerry "live" show.'
    # RD-1/2/3/4/5: A/B/A/C/B → A/B/C, order, unique kept, exact only, similar-but-different kept
    t = "Venue: Theater A. Venue: Theater B. Venue: Theater A. Ticket: link here. Venue: Theater B."
    ded, st = dedupe_exact_blocks(t)
    assert ded == "Venue: Theater A. Venue: Theater B. Ticket: link here.", ded
    assert st == {"blocks": 5, "unique_blocks": 3, "duplicates_removed": 2}, st
    # literal \n separated program listing (the Production pattern)
    t2 = "\\nPerformance Dates: Oct 6\\nVenue: X\\n\\nPerformance Dates: Oct 6\\nVenue: X\\nVenue: Y"
    d2, s2 = dedupe_exact_blocks(t2); assert d2 == "Performance Dates: Oct 6 Venue: X Venue: Y", d2; assert s2["duplicates_removed"] == 2
    # exact duplicates are removed regardless of length (first kept); different short fragments both kept
    d3, _ = dedupe_exact_blocks("1. Alpha. 2. Beta. 1. Alpha. 3. Gamma."); assert d3 == "1. Alpha. 2. Beta. 3. Gamma.", d3
    # RD-6/7: allowlist only
    rep = "<p>Block one is here. Block one is here.</p>"
    assert seoul_description("seoul-KOPk4sx8q", "en", rep) == "Block one is here."
    assert seoul_description("seoul-KOPk4sx8q", "ko", rep) == "Block one is here. Block one is here."      # locale not approved
    assert seoul_description("seoul-KOPrfwk6e", "ja", rep) == "Block one is here. Block one is here."      # locale not approved for this place
    assert seoul_description("seoul-KOP000034", "en", rep) == "Block one is here. Block one is here."      # place not in allowlist
    assert SEOUL_DEDUPE_ALLOWLIST == {"seoul-KOPk4sx8q": ("en", "ja", "zh"), "seoul-KOPrfwk6e": ("en", "zh"), "seoul-KOPpq0clc": ("en",)}
    # RD-8: byte-identical on repeated calls; empty → None
    assert seoul_description("seoul-KOPk4sx8q", "en", t2) == seoul_description("seoul-KOPk4sx8q", "en", t2)
    assert seoul_description("x", "en", "<style>.a{}</style>") is None
    print("self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test(); sys.exit(0)
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else ""
    r = run(out)
    print(json.dumps({k: v for k, v in r.items() if k != "dedupe_rows"}, ensure_ascii=False))
    for d in r["dedupe_rows"]:
        print(json.dumps(d, ensure_ascii=False))
