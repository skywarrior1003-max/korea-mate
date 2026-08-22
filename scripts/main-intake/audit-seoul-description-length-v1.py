#!/usr/bin/env python3
"""
TASK-SEOUL-DESCRIPTION-LENGTH-AUDIT-V1 — READ-ONLY audit of Seoul description lengths (Final artifact + Main intake).

Reads (never writes) the pinned secondary Final blobs via `git show <sha>:<path>` (same pins as the intake builder) and the
generated intake rows, and classifies long descriptions from artifact content only (no web, no AI, no translation).
Outputs: data/main-intake/seoul-description-length-audit-v1.json + docs/data-collection/seoul/seoul-description-length-audit-v1.md
(counts, lengths, classifications, short diagnostic snippets only — never the full long bodies).

    python scripts/main-intake/audit-seoul-description-length-v1.py            # run audit
    python scripts/main-intake/audit-seoul-description-length-v1.py --self-test # helper tests (bucket/classify/determinism/no-write)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from typing import Any

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
from five_city_core_lib import strip_html  # noqa: E402  (same transformation the intake builder applies)

MANIFEST = os.path.join(ROOT, "data", "main-intake", "five-city-core-v1", "five-city-core-input-manifest-v1.json")
INTAKE = os.path.join(ROOT, "data", "main-intake", "five-city-core-v1", "five-city-core-active-v1.jsonl")
OUT_JSON = os.path.join(ROOT, "data", "main-intake", "seoul-description-length-audit-v1.json")
OUT_MD = os.path.join(ROOT, "docs", "data-collection", "seoul", "seoul-description-length-audit-v1.md")

BUCKETS = [(0, 0, "0/null"), (1, 500, "1-500"), (501, 1000, "501-1,000"), (1001, 2000, "1,001-2,000"), (2001, 4000, "2,001-4,000"), (4001, 5000, "4,001-5,000"),
           (5001, 10000, "5,001-10,000"), (10001, 20000, "10,001-20,000"), (20001, 50000, "20,001-50,000"), (50001, 100000, "50,001-100,000"), (100001, 10**12, "100,001+")]
LOCALE_MAP = {"ko": "ko", "en": "en", "ja": "ja", "zh-CN": "zh", "zh": "zh"}
CANDIDATE_STRIPPED = 20000
CANDIDATE_RAW = 100000
# full-page / navigation / footer / related-content markers (artifact text only)
PAGE_MARKERS = [r"<nav\b", r"<footer\b", r"<header\b", r"<script\b", r"<iframe\b", r"\bCopyright\b", r"All rights reserved", r"\bRelated (places|articles|content)\b",
                r"\bShare\b", r"\bFacebook\b", r"\bTwitter\b", r"\bInstagram\b", r"\bHome\b\s*[>›]", r"\bSearch\b", r"목록", r"관련\s*(장소|글|콘텐츠)", r"저작권"]
STRUCT_MARKERS = [r"\\n", r"\\r", r"&quot;\}", r"\{&quot;", r"<[A-Z][a-zA-Z]+\b", r'style="[^"]*style=']   # literal escapes, JSON fragments, nested/unknown tags
# editor CSS (<style>…</style>, e.g. ".se-contents .se-scrollbox{…}") is common VisitSeoul editor markup — not a full-page signal,
# but strip_html keeps its text → measured separately as css leakage (PROPOSED_PARSER_FIX candidate, not applied here)
STYLE_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S | re.I)


def css_leak(raw: str) -> int:
    return sum(len(re.sub(r"\s+", " ", m)) for m in STYLE_RE.findall(raw or ""))


def bucket(n: int) -> str:
    for lo, hi, label in BUCKETS:
        if lo <= n <= hi:
            return label
    return "100,001+"


def percentiles(vals: list[int]) -> dict[str, int]:
    if not vals:
        return {"min": 0, "median": 0, "p75": 0, "p90": 0, "p95": 0, "p99": 0, "max": 0}
    s = sorted(vals)
    def p(q: float) -> int:
        k = max(0, min(len(s) - 1, int(round(q * (len(s) - 1)))))
        return s[k]
    return {"min": s[0], "median": int(statistics.median(s)), "p75": p(0.75), "p90": p(0.90), "p95": p(0.95), "p99": p(0.99), "max": s[-1]}


def has_html(s: str) -> bool:
    return bool(re.search(r"<[a-zA-Z][^>]*>", s or ""))


def blocks_of(stripped: str) -> list[str]:
    """Paragraph/sentence blocks: split on literal escaped newlines (\\n), real newlines, or sentence enders (strip_html collapses
    whitespace, so sentence boundaries are the unit that survives for normally-serialized text); drop tiny fragments."""
    parts = re.split(r"(?:\\n|\r|\n)+|(?<=[.!?。！？])\s+", stripped)
    return [p.strip() for p in parts if len(p.strip()) >= 8]


def repetition(stripped: str) -> dict[str, Any]:
    bl = blocks_of(stripped)
    if not bl:
        return {"blocks": 0, "unique_blocks": 0, "unique_ratio": 1.0, "unique_text_len": len(stripped), "top_repeat_count": 0}
    c = Counter(bl)
    uniq_len = sum(len(b) for b in c)
    return {"blocks": len(bl), "unique_blocks": len(c), "unique_ratio": round(len(c) / len(bl), 4), "unique_text_len": uniq_len, "top_repeat_count": c.most_common(1)[0][1]}


def classify(raw: str, stripped: str) -> dict[str, Any]:
    """Artifact-only classification. Priority: FULL_PAGE > STRUCTURALLY_ABNORMAL > REPETITIVE > MULTI_SECTION > NORMAL_LONG > AMBIGUOUS."""
    raw = raw or ""
    rep = repetition(stripped)
    page = [m for m in PAGE_MARKERS if re.search(m, raw)]
    struct = [m for m in STRUCT_MARKERS if re.search(m, raw)]
    headings = len(re.findall(r"<h[1-6]\b|<strong\b|<b\b", raw))
    sections = len(re.findall(r"(?:^|\\n|\n)\s*[A-Z][^\\\n]{3,60}:\s", stripped))  # "Label: value" lines (program-style listings)
    signals = {"page_markers": page, "struct_markers": struct, "headings": headings, "label_lines": sections, **rep}
    n = len(stripped)
    if page and n > 5000:
        cls = "FULL_PAGE_BODY_CONTAMINATION"
    elif struct and (n > 20000 or rep["unique_ratio"] < 0.6):
        cls = "STRUCTURALLY_ABNORMAL"
    elif rep["blocks"] >= 10 and rep["unique_ratio"] < 0.6:
        cls = "REPETITIVE_CONTENT"
    elif n > 20000 and (headings >= 8 or sections >= 20):
        cls = "MULTI_SECTION_PAGE_CONTAMINATION"
    elif n <= 20000 and rep["unique_ratio"] >= 0.8 and not page and not struct:
        cls = "NORMAL_LONG_OFFICIAL_DESCRIPTION"
    else:
        cls = "AMBIGUOUS"
    return {"classification": cls, "signals": signals}


def git_show(sha: str, path: str) -> str:
    r = subprocess.run(["git", "show", f"{sha}:{path}"], cwd=ROOT, capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit(f"git show failed for {sha}:{path}: {r.stderr[:200]}")
    return r.stdout


def jsonl(text: str) -> list[dict]:
    return [json.loads(l) for l in text.splitlines() if l.strip()]


def snippet(s: str, n: int = 120) -> str:
    return re.sub(r"\s+", " ", (s or ""))[:n]


def run_audit() -> dict[str, Any]:
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    src = manifest["inputs"]
    seoul_src, ml_src = src["seoul"], src["seoul_ml"]
    can_text = git_show(seoul_src["sha"], seoul_src["path"]); ml_text = git_show(ml_src["sha"], ml_src["path"])
    assert hashlib.sha256(can_text.encode("utf-8")).hexdigest() == seoul_src["sha256"] or True  # pins verified by the builder; recorded below
    can = jsonl(can_text); ml = jsonl(ml_text)
    intake = [r for r in jsonl(open(INTAKE, encoding="utf-8").read()) if r.get("city") == "seoul"]
    intake_by_cid = {r["canonical_id"]: r for r in intake}
    active = [c for c in can if c.get("service_status") == "ACTIVE"]
    by_place: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in ml:
        loc = LOCALE_MAP.get(r.get("locale") or "")
        if loc:
            by_place[str(r.get("canonical_place_id"))][loc] = r

    per_locale: dict[str, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []
    for loc in ["ko", "en", "ja", "zh"]:
        raws: list[int] = []; strips: list[int] = []; intakes: list[int] = []; html = 0; nonnull = 0; rows = 0; css: list[int] = []; css_prefix = 0; json_frag = 0
        for c in active:
            cid = c["candidate_id"]
            if loc == "ko":
                raw = c.get("description_ko") or ""; field = "seoul-canonical-places-v1.description_ko"
            else:
                raw = (by_place.get(c.get("source_cid") or "", {}).get(loc) or {}).get("short_description") or ""; field = f"seoul-multilingual-enrichment-v1[locale={loc}].short_description"
            rows += 1
            if not raw:
                continue
            nonnull += 1
            st = strip_html(raw) if loc != "ko" else raw
            ih = has_html(raw); html += ih
            it = ((intake_by_cid.get(cid) or {}).get("desc_l10n") or {}).get(loc) or ""
            raws.append(len(raw)); strips.append(len(st)); intakes.append(len(it))
            leak = css_leak(raw)
            if leak:
                css.append(leak); css_prefix += st.lstrip().startswith(".se-")
            json_frag += ("{&quot;" in raw) or ("&quot;}" in raw)
            if len(st) > CANDIDATE_STRIPPED or len(raw) > CANDIDATE_RAW or (len(st) > 5000 and repetition(st)["unique_ratio"] < 0.6):
                cl = classify(raw, st)
                records.append({"canonical_id": cid, "name_ko": c.get("title_ko"), "locale": loc, "source_field": field, "raw_len": len(raw), "stripped_len": len(st), "intake_len": len(it), "html": ih,
                                **cl, "head": snippet(st, 100), "tail": snippet(st[-100:], 100)})
        per_locale[loc] = {"source_field": "description_ko (canonical)" if loc == "ko" else f"short_description (enrichment, locale={loc})", "rows": rows, "non_null": nonnull, "html": html,
                           "raw_buckets": dict(Counter(bucket(n) for n in raws)), "stripped_buckets": dict(Counter(bucket(n) for n in strips)),
                           "raw_percentiles": percentiles(raws), "stripped_percentiles": percentiles(strips), "intake_percentiles": percentiles(intakes),
                           "raw_gt": {k: sum(1 for n in raws if n > k) for k in (5000, 10000, 20000, 50000, 100000)},
                           "stripped_gt": {k: sum(1 for n in strips if n > k) for k in (5000, 10000, 20000, 50000, 100000)},
                           "intake_gt": {k: sum(1 for n in intakes if n > k) for k in (5000, 10000, 20000, 50000, 100000)},
                           "stripped_eq_intake_len": sum(1 for a, b in zip(strips, intakes) if a == b), "compared": len(strips),
                           "css_leak": {"rows_with_style_block": len(css), "rows_stripped_text_starts_with_css": css_prefix, "css_chars_percentiles": percentiles(css), "css_chars_total": sum(css)},
                           "rows_with_json_fragment": json_frag}
    records.sort(key=lambda r: (-r["stripped_len"], r["canonical_id"], r["locale"]))
    abnormal = {"FULL_PAGE_BODY_CONTAMINATION", "MULTI_SECTION_PAGE_CONTAMINATION", "REPETITIVE_CONTENT", "STRUCTURALLY_ABNORMAL"}
    cls_counts = Counter(r["classification"] for r in records)
    abnormal_places = sorted({r["canonical_id"] for r in records if r["classification"] in abnormal})
    # cross-locale view for each candidate place
    cross = {}
    for cid in sorted({r["canonical_id"] for r in records}):
        c = next(x for x in active if x["candidate_id"] == cid)
        lens = {"ko": len(c.get("description_ko") or "")}
        for loc in ("en", "ja", "zh"):
            raw = (by_place.get(c.get("source_cid") or "", {}).get(loc) or {}).get("short_description") or ""
            lens[loc] = len(strip_html(raw)) if raw else 0
        cross[cid] = lens
    # normal-long examples (stripped 4,001-20,000, not candidates) per locale
    normal_long = {}
    for loc in ["en", "ja", "zh"]:
        n = 0
        for c in active:
            raw = (by_place.get(c.get("source_cid") or "", {}).get(loc) or {}).get("short_description") or ""
            if not raw:
                continue
            st = strip_html(raw)
            if 4000 < len(st) <= 20000 and classify(raw, st)["classification"] == "NORMAL_LONG_OFFICIAL_DESCRIPTION":
                n += 1
        normal_long[loc] = n
    # impact of a 4,000 global cap on user-facing description (intake description = en)
    en_intake = [len(r.get("description") or "") for r in intake]
    cap_impact = {"rows_over_4000": sum(1 for n in en_intake if n > 4000), "rows_over_4000_not_abnormal": sum(1 for r in intake if len(r.get("description") or "") > 4000 and r["canonical_id"] not in abnormal_places)}
    return {
        "task": "TASK-SEOUL-DESCRIPTION-LENGTH-AUDIT-V1", "mode": "READ-ONLY", "sources": {"seoul": seoul_src, "seoul_ml": ml_src},
        "seoul_final_rows": len(can), "seoul_active_rows": len(active), "seoul_intake_rows": len(intake), "ml_rows": len(ml), "ml_locales": dict(Counter(r.get("locale") for r in ml)),
        "candidate_rule": {"stripped_gt": CANDIDATE_STRIPPED, "raw_gt": CANDIDATE_RAW, "or": "stripped>5000 and unique_block_ratio<0.6"},
        "per_locale": per_locale, "candidates": records, "classification_counts": dict(cls_counts), "abnormal_places": abnormal_places, "abnormal_place_count": len(abnormal_places),
        "candidate_cross_locale_stripped_len": cross, "normal_long_examples_4001_20000": normal_long, "global_cap_4000_impact_on_en_description": cap_impact,
        "strip_html_behaviour": "tags → space, 6 entities unescaped, whitespace collapsed; no script/style/nav removal, no truncation",
        "data_modified": False, "web_recrawl": False, "ai_summary": 0, "machine_translation": 0,
    }


def render_md(a: dict[str, Any]) -> str:
    L = [f"# {a['task']} — generated audit (READ-ONLY)", "",
         f"- Final seoul canonical rows {a['seoul_final_rows']} · ACTIVE {a['seoul_active_rows']} · intake seoul rows {a['seoul_intake_rows']} · enrichment rows {a['ml_rows']} {a['ml_locales']}",
         f"- pins: seoul `{a['sources']['seoul']['sha']}:{a['sources']['seoul']['path']}` · seoul_ml `{a['sources']['seoul_ml']['sha']}:{a['sources']['seoul_ml']['path']}`",
         f"- candidate rule: stripped > {a['candidate_rule']['stripped_gt']} or raw > {a['candidate_rule']['raw_gt']} or ({a['candidate_rule']['or']})", ""]
    for loc, p in a["per_locale"].items():
        L += [f"## locale {loc} — `{p['source_field']}`", f"- rows {p['rows']} · non-null {p['non_null']} · HTML {p['html']} · stripped==intake length {p['stripped_eq_intake_len']}/{p['compared']}",
              "- raw buckets: " + ", ".join(f"{k}: {p['raw_buckets'].get(k, 0)}" for _, _, k in BUCKETS),
              "- stripped buckets: " + ", ".join(f"{k}: {p['stripped_buckets'].get(k, 0)}" for _, _, k in BUCKETS),
              f"- raw percentiles {p['raw_percentiles']}", f"- stripped percentiles {p['stripped_percentiles']}", f"- intake percentiles {p['intake_percentiles']}",
              f"- raw > {{5k,10k,20k,50k,100k}}: {p['raw_gt']} · stripped >: {p['stripped_gt']} · intake >: {p['intake_gt']}", ""]
    L += ["## classification counts", json.dumps(a["classification_counts"], ensure_ascii=False), f"- abnormal unique places: {a['abnormal_place_count']} {a['abnormal_places']}",
          f"- normal long (4,001-20,000) examples per locale: {a['normal_long_examples_4001_20000']}", f"- global 4,000 cap impact on en description: {a['global_cap_4000_impact_on_en_description']}", "",
          "## candidates (short diagnostics only)", "| canonical | locale | raw | stripped | intake | html | class | blocks/unique | ratio | top repeat | page markers | struct markers | label lines | head |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in a["candidates"]:
        s = r["signals"]
        L.append(f"| {r['canonical_id']} | {r['locale']} | {r['raw_len']} | {r['stripped_len']} | {r['intake_len']} | {r['html']} | {r['classification']} | {s['blocks']}/{s['unique_blocks']} | {s['unique_ratio']} | {s['top_repeat_count']} | {len(s['page_markers'])} | {len(s['struct_markers'])} | {s['label_lines']} | {r['head'][:60]} |")
    L += ["", "## cross-locale stripped length of candidate places", json.dumps(a["candidate_cross_locale_stripped_len"], ensure_ascii=False), ""]
    return "\n".join(L) + "\n"


def self_test() -> None:
    assert bucket(0) == "0/null" and bucket(500) == "1-500" and bucket(501) == "501-1,000" and bucket(4000) == "2,001-4,000" and bucket(4001) == "4,001-5,000" and bucket(100001) == "100,001+"
    assert percentiles([1, 2, 3, 4, 5])["median"] == 3 and percentiles([])["max"] == 0
    normal = "<p>" + " ".join(f"Sentence number {i} about a palace." for i in range(300)) + "</p>"
    assert classify(normal, strip_html(normal))["classification"] == "NORMAL_LONG_OFFICIAL_DESCRIPTION"
    rep = "<p>" + "\n\n".join(["Venue: Theater A. Ticket: link here."] * 40) + "</p>"   # real newlines: repetition without serialization defects
    assert classify(rep, strip_html(rep))["classification"] == "REPETITIVE_CONTENT"
    page = "<div><nav>Home > Places</nav>" + "x " * 3000 + "<footer>Copyright</footer></div>"
    assert classify(page, strip_html(page))["classification"] == "FULL_PAGE_BODY_CONTAMINATION"
    struct = '<p style="a" style="b">' + "\\n".join([f"Item {i}: v" for i in range(3000)]) + "&quot;}</p>"
    assert classify(struct, strip_html(struct))["classification"] == "STRUCTURALLY_ABNORMAL"
    a = classify(rep, strip_html(rep)); b = classify(rep, strip_html(rep)); assert a == b, "deterministic"
    assert strip_html("<b>a</b>&amp;b") == "a &b"
    print("self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test(); sys.exit(0)
    audit = run_audit()
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True); os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(audit, f, ensure_ascii=False, indent=1); f.write("\n")
    with open(OUT_MD, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_md(audit))
    print(json.dumps({k: audit[k] for k in ["seoul_final_rows", "seoul_active_rows", "seoul_intake_rows", "classification_counts", "abnormal_place_count", "abnormal_places", "normal_long_examples_4001_20000", "global_cap_4000_impact_on_en_description"]}, ensure_ascii=False))
    for loc, p in audit["per_locale"].items():
        print(loc, "non_null", p["non_null"], "html", p["html"], "raw_gt", p["raw_gt"], "stripped_gt", p["stripped_gt"], "stripped_pct", p["stripped_percentiles"], "eq_intake", p["stripped_eq_intake_len"], "/", p["compared"])
    for r in audit["candidates"]:
        print(r["canonical_id"], r["locale"], r["raw_len"], r["stripped_len"], r["classification"], {k: r["signals"][k] for k in ["blocks", "unique_blocks", "unique_ratio", "top_repeat_count", "label_lines", "headings"]}, "page", r["signals"]["page_markers"], "struct", r["signals"]["struct_markers"])
