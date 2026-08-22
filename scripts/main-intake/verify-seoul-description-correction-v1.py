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
from five_city_core_lib import strip_html, strip_code_blocks, visible_text, split_blocks, dedupe_blocks, dedupe_exact_blocks, seoul_description, SEOUL_DEDUPE_ALLOWLIST, is_html_tag_token, protect_visible_angle_tokens, restore_visible_angle_tokens, _SENTINEL_OPEN, _SENTINEL_CLOSE  # noqa: E402

MANIFEST = os.path.join(ROOT, "data", "main-intake", "five-city-core-v1", "five-city-core-input-manifest-v1.json")
LOCALE_MAP = {"en": "en", "ja": "ja", "zh-CN": "zh"}
STYLE_RE = re.compile(r"<style\b", re.I); SCRIPT_RE = re.compile(r"<script\b", re.I)
ANGLE_RE = re.compile(r"<[^<>]+>")
CSS_LEAK_RE = re.compile(r"\.se-contents|\{\s*overflow|scrollbar-width|-ms-overflow-style", re.I)
SCRIPT_LEAK_RE = re.compile(r"@context|schema\.org|application/ld\+json|\bfunction\s*\(", re.I)
def html_tag_leaks(text: str) -> list[str]:
    """standard HTML tag tokens present in final text (same classifier as the pipeline) — expected 0."""
    return [t for t in ANGLE_RE.findall(text) if is_html_tag_token(t)]


def visible_token_counts(src: str) -> Counter:
    """occurrences of non-HTML angle tokens in the VISIBLE source text, i.e. outside any HTML tag (attribute values such as
    Google-Sheets `data-sheets-value` JSON copies are inside the tag). Uses the pipeline's own tag model: after protection every
    remaining '<'/'>' belongs to real markup, so a sentinel is inside a tag iff the nearest preceding '<' comes after the nearest '>'."""
    protected, toks = protect_visible_angle_tokens(src)
    out: Counter = Counter()
    for m in re.finditer(f"{_SENTINEL_OPEN}(\\d+){_SENTINEL_CLOSE}", protected):
        inside_tag = protected.rfind("<", 0, m.start()) > protected.rfind(">", 0, m.start())
        if not inside_tag:
            out[restore_visible_angle_tokens(m.group(0), toks)] += 1   # nested titles restore to their full text
    return out


def old_visible(raw: str) -> str:
    """14d71c9 pipeline (code blocks removed, no angle-bracket protection) — reference for the angle-bracket audit."""
    return strip_html(strip_code_blocks(raw))


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
    cap_trunc = 0; loss = 0; invariant_pass = 0
    angle_rows = []; html_leak = 0; css_leak = 0; script_leak = 0; angle_token_loss = 0
    for c in active:
        cid = c["candidate_id"]
        for loc in ("en", "ja", "zh"):
            raw = (byp.get(c.get("source_cid") or "", {}).get(loc) or {}).get("short_description")
            if not raw:
                continue
            before = strip_html(raw) or None                       # original (pre-correction) path
            after = seoul_description(cid, loc, raw)
            nonnull_before[loc] += before is not None; nonnull_after[loc] += after is not None
            if before is not None:
                before_len[loc].append(len(before))
            if after is not None:
                after_len[loc].append(len(after))
            has_style = bool(STYLE_RE.search(raw)); has_script = bool(SCRIPT_RE.search(raw))
            style[loc] += has_style; script[loc] += has_script
            in_allow = loc in SEOUL_DEDUPE_ALLOWLIST.get(cid, ())
            # angle-bracket audit: visible (non-HTML) tokens in the code-stripped source
            src = strip_code_blocks(raw); raw_tokens = Counter(t for t in ANGLE_RE.findall(src) if not is_html_tag_token(t))
            has_angle = bool(raw_tokens)
            if has_angle:
                old_out = old_visible(raw); new_out = after or ""; visible_counts = visible_token_counts(src)
                per_tok = []
                for tok in sorted(set(raw_tokens) | set(visible_counts)):
                    n_all = raw_tokens.get(tok, 0); n_vis = visible_counts.get(tok, 0)
                    old_n = old_out.count(tok); new_n = new_out.count(tok)
                    expected_new = min(n_vis, 1) if in_allow else n_vis   # dedupe rows collapse repeats; otherwise every VISIBLE occurrence must survive
                    lost = new_n < expected_new
                    angle_token_loss += lost
                    per_tok.append({"token": tok, "source_occurrences_incl_attribute_copies": n_all, "visible_source_occurrences": n_vis, "old_derived_occurrences": old_n, "new_derived_occurrences": new_n, "lost_after_fix": lost})
                angle_rows.append({"canonical_id": cid, "name_ko": c.get("title_ko"), "locale": loc, "dedupe_row": in_allow, "tokens": per_tok})
            if after != before:
                changed[loc] += 1
                if not (has_style or has_script or in_allow or has_angle):
                    unapproved.append((cid, loc))
            # change cause of the angle-bracket protection itself (vs. the 14d71c9 path): token restoration only, or a broken
            # tag boundary corrected (attribute-copy garbage such as data-sheets-value JSON no longer leaks into visible text)
            if has_angle:
                old_vis = old_visible(raw); new_vis = visible_text(raw)
                restored_only = len(new_vis) >= len(old_vis)
                angle_rows[-1]["old_visible_chars"] = len(old_vis); angle_rows[-1]["new_visible_chars"] = len(new_vis)
                angle_rows[-1]["change_cause"] = "TOKEN_RESTORATION_ONLY" if restored_only else "TAG_BOUNDARY_CORRECTED_ATTRIBUTE_COPY_REMOVED"
                angle_rows[-1]["data_sheets_value_attr"] = "data-sheets-value" in raw
            # global cap check: after must equal the pipeline text unless dedupe applied (never truncated by length)
            if not in_allow and after != (visible_text(raw) or None):
                cap_trunc += 1
            # leakage checks on the final text
            if after:
                html_leak += bool(html_tag_leaks(after)); css_leak += bool(CSS_LEAK_RE.search(after)); script_leak += bool(SCRIPT_LEAK_RE.search(after))
            if in_allow:
                vis = visible_text(raw); ded, stats = dedupe_exact_blocks(vis)
                blocks_before = split_blocks(vis); kept = dedupe_blocks(blocks_before)
                # unique official block loss: every distinct block must survive (as a kept block AND as a substring of the output text)
                lost_blocks = sorted(b for b in set(blocks_before) if b not in kept or re.sub(r"\s+", " ", b) not in ded); loss += len(lost_blocks)
                first_order = [b for i, b in enumerate(blocks_before) if b not in blocks_before[:i]]
                order_ok = kept == first_order and ded == re.sub(r"\s+", " ", " ".join(first_order)).strip()
                inv = stats["blocks"] >= stats["unique_blocks"] and stats["after_blocks"] == stats["unique_blocks"] and stats["duplicates_removed"] == stats["blocks"] - stats["unique_blocks"] and len(kept) == stats["after_blocks"]
                invariant_pass += inv
                dedup_rows.append({"canonical_id": cid, "name_ko": c.get("title_ko"), "locale": loc, "before_chars_old_path": len(before or ""), "before_chars_after_code_removal": len(vis), "after_chars": len(ded),
                                   "before_blocks": stats["blocks"], "unique_blocks": stats["unique_blocks"], "duplicates_removed": stats["duplicates_removed"], "after_blocks": stats["after_blocks"],
                                   "unique_block_loss": len(lost_blocks), "invariant_pass": inv, "first_occurrence_order_preserved": order_ok, "deterministic": dedupe_exact_blocks(vis)[0] == ded, "head": re.sub(r"\s+", " ", ded)[:90]})
    res = {"seoul_final_rows": len(can), "seoul_active_before": len(active), "seoul_active_after": len(active), "place_removed": 0, "place_added": 0, "canonical_identity_changed": 0,
           "style_affected_rows": dict(style), "script_affected_rows": dict(script), "description_changed_rows": dict(changed), "description_changed_rows_total": sum(changed.values()),
           "dedupe_rows": dedup_rows, "dedupe_locale_rows": len(dedup_rows), "dedupe_places": len({r["canonical_id"] for r in dedup_rows}), "unique_official_block_loss": loss, "metric_invariant_pass": f"{invariant_pass}/{len(dedup_rows)}",
           "angle_bracket": {"affected_places": len({r["canonical_id"] for r in angle_rows}), "affected_locale_rows": len(angle_rows), "unique_tokens": sum(len(r["tokens"]) for r in angle_rows),
                             "token_occurrences_incl_attribute_copies": sum(t["source_occurrences_incl_attribute_copies"] for r in angle_rows for t in r["tokens"]), "visible_token_occurrences": sum(t["visible_source_occurrences"] for r in angle_rows for t in r["tokens"]),
                             "visible_tokens_lost_in_old_derived": sum(1 for r in angle_rows for t in r["tokens"] if t["visible_source_occurrences"] > 0 and t["old_derived_occurrences"] < min(t["visible_source_occurrences"], 1 if r["dedupe_row"] else t["visible_source_occurrences"])),
                             "tokens_lost_after_fix": angle_token_loss, "rows": angle_rows},
           "leakage_after_fix": {"standard_html_tag_rows": html_leak, "css_rows": css_leak, "script_jsonld_rows": script_leak},
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
    assert st == {"blocks": 5, "unique_blocks": 3, "duplicates_removed": 2, "after_blocks": 3}, st
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
    # STAT-1..5: single block universe — blocks ≥ unique, removed = blocks − unique, after == unique, deterministic
    _, st5 = dedupe_exact_blocks("A one. B two. A one. C three. B two. 1. 1. 2.")
    assert st5 == {"blocks": 8, "unique_blocks": 5, "duplicates_removed": 3, "after_blocks": 5}, st5
    assert dedupe_exact_blocks("A one. B two. A one.")[1] == dedupe_exact_blocks("A one. B two. A one.")[1]
    # AB-1..12: non-HTML angle-bracket titles preserved, real tags stripped, no leakage, sentinel-safe, deterministic
    assert is_html_tag_token("<div>") and is_html_tag_token("</div>") and is_html_tag_token('<p class="x">') and is_html_tag_token("<br/>") and is_html_tag_token("<BR>") and is_html_tag_token("<o:p>") and is_html_tag_token("<!-- c -->")
    assert not is_html_tag_token("<Parasite>") and not is_html_tag_token("<Corps extremes>") and not is_html_tag_token("<地上的女人们>") and not is_html_tag_token("<Buncheong Stroll>")
    assert not is_html_tag_token("<A Notional History>") and not is_html_tag_token("<A Magical day>"), "tag-named first word + plain words = title"
    assert is_html_tag_token('<a href="x">') and is_html_tag_token("<a>") and is_html_tag_token("<A>") and is_html_tag_token("<br />")
    assert is_html_tag_token('<Corps style="x">'), "attribute-bearing unknown token is markup"
    # broken Google-Sheets paste: attribute copy contains a title token — the token's '>' must not terminate the span (no attribute JSON leak)
    sheets = '<p><span style="a" data-sheets-value="{&quot;2&quot;:&quot;copy text <Corps extremes> more copy&quot;}">Visible text <Corps extremes> here.</span></p>'
    assert visible_text(sheets) == "Visible text <Corps extremes> here.", visible_text(sheets)
    ab = '<div><p class="x">The movie <Parasite>, which was a mega-hit worldwide, and <b>Squid Game</b>.<br/>Next: <Corps extremes> at 8pm.</p></div>'
    out = visible_text(ab)
    # (strip_html turns every real tag into a space — "Squid Game ." is the pre-existing behaviour, unchanged by this fix)
    assert out == "The movie <Parasite>, which was a mega-hit worldwide, and Squid Game . Next: <Corps extremes> at 8pm.", out
    assert "<div" not in out and "</b>" not in out and "<br" not in out and "<p" not in out
    ab2 = '<style>.se-contents{overflow-x:auto}</style><script type="application/ld+json">{"@context":"https://schema.org"}</script><p>See <Parasite> today.</p>'
    assert visible_text(ab2) == "See <Parasite> today.", visible_text(ab2)
    assert visible_text(ab) == visible_text(ab), "AB-11 deterministic"
    p, toks = protect_visible_angle_tokens("<Parasite> and <div>"); assert toks == ["<Parasite>"] and "<div>" in p and "<Parasite>" not in p
    try:
        protect_visible_angle_tokens("xy"); raise AssertionError("sentinel collision must fail")
    except ValueError:
        pass
    assert seoul_description("seoul-KOPpq0clc", "en", "<p><Parasite>, a hit. <Parasite>, a hit.</p>") == "<Parasite>, a hit."
    print("self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test(); sys.exit(0)
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else ""
    r = run(out)
    print(json.dumps({k: v for k, v in r.items() if k != "dedupe_rows"}, ensure_ascii=False))
    for d in r["dedupe_rows"]:
        print(json.dumps(d, ensure_ascii=False))
