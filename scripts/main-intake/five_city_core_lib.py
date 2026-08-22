"""
five-city core intake — 공용 도우미 (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)

무엇을 하나
  보조컴퓨터의 최종 canonical artifact 를 **고정된 remote ref + SHA** 에서 `git show` 로만
  읽는다(checkout·merge 없음). 같은 입력이면 같은 출력이 나오도록 모든 정렬을 고정한다.

하지 않는 것
  DB 접근 0 · 네트워크 0 · 사용자 데이터 0 · 원본 artifact 수정 0.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import unicodedata
from typing import Any, Iterable

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# ── 고정 입력 (branch · SHA · path) ───────────────────────────────────────────
# SHA 가 remote 와 달라지면 builder 가 멈춘다 — 나중에 보조 branch 가 더 바뀌어도
# 이번 intake 가 무엇을 읽었는지 재현 가능해야 한다.
PINNED_INPUTS: dict[str, dict[str, Any]] = {
    "busan_food": {
        "city": "busan", "branch": "data/busan-food-discovery-v1", "sha": "40ecc06",
        "path": "data/tourapi/normalized/busan/busan-food-194-canonical-v1.json", "kind": "json-records",
    },
    "busan_nonfood": {
        "city": "busan", "branch": "data/busan-nonfood-complete-v1", "sha": "26fb3af",
        "path": "data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json", "kind": "json-records",
    },
    "busan_food_ml": {
        "city": "busan", "branch": "data/busan-multilingual-v1", "sha": "c4305f3",
        "path": "data/tourapi/multilingual/busan/busan-food-multilingual-enrichment-v1.jsonl", "kind": "jsonl",
    },
    "busan_nonfood_ml": {
        "city": "busan", "branch": "data/busan-multilingual-v1", "sha": "c4305f3",
        "path": "data/tourapi/multilingual/busan/busan-nonfood-multilingual-enrichment-v1.jsonl", "kind": "jsonl",
    },
    "gyeongju": {
        "city": "gyeongju", "branch": "data/five-city-regional-content-handoff-v1", "sha": "922cce0",
        "path": "data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl", "kind": "jsonl",
    },
    "gyeongju_sources": {
        "city": "gyeongju", "branch": "data/five-city-regional-content-handoff-v1", "sha": "922cce0",
        "path": "data/gyeongju-final-release/gyeongju-city-spot-sources-import-v1.jsonl", "kind": "jsonl",
    },
    "gyeongju_images": {
        "city": "gyeongju", "branch": "data/five-city-regional-content-handoff-v1", "sha": "922cce0",
        "path": "data/gyeongju-final-release/gyeongju-city-spot-images-import-v1.jsonl", "kind": "jsonl",
    },
    "seoul": {
        "city": "seoul", "branch": "data/seoul-multilingual-v1", "sha": "e9e9967",
        "path": "data/seoul-final-release/seoul-canonical-places-v1.jsonl", "kind": "jsonl",
    },
    "seoul_ml": {
        "city": "seoul", "branch": "data/seoul-multilingual-v1", "sha": "e9e9967",
        "path": "data/seoul-multilingual-v1/seoul-multilingual-enrichment-v1.jsonl", "kind": "jsonl",
    },
    "jeju": {
        "city": "jeju", "branch": "data/jeju-multilingual-v1", "sha": "649d169",
        "path": "data/jeju-final-release/jeju-canonical-places-v1.jsonl", "kind": "jsonl",
    },
    "jeju_ml": {
        "city": "jeju", "branch": "data/jeju-multilingual-v1", "sha": "649d169",
        "path": "data/jeju-multilingual-v1/jeju-multilingual-enrichment-v1.jsonl", "kind": "jsonl",
    },
    "jeonju": {
        "city": "jeonju", "branch": "data/jeonju-multilingual-v1", "sha": "436fe37",
        "path": "data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json", "kind": "json-catalog",
    },
    "jeonju_ml": {
        "city": "jeonju", "branch": "data/jeonju-multilingual-v1", "sha": "436fe37",
        "path": "data/jeonju-multilingual-v1/jeonju-multilingual-enrichment-v1.jsonl", "kind": "jsonl",
    },
}

EXPECTED_ACTIVE = {"busan_food": 194, "busan_nonfood": 764, "gyeongju": 299, "seoul": 1837, "jeju": 1496, "jeonju": 236}
EXPECTED_TOTAL = 4826


def git_show(ref: str, path: str) -> str:
    out = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, cwd=REPO)
    if out.returncode != 0:
        raise SystemExit(f"git show failed for {ref}:{path}: {out.stderr.decode('utf-8', 'ignore')[:200]}")
    return out.stdout.decode("utf-8")


def resolve_sha(ref: str) -> str:
    out = subprocess.run(["git", "rev-parse", "--short=7", ref], capture_output=True, cwd=REPO, text=True)
    if out.returncode != 0:
        raise SystemExit(f"rev-parse failed for {ref}")
    return out.stdout.strip()


def verify_pins() -> dict[str, str]:
    """remote branch 의 현재 SHA 가 고정값과 같은지 — 다르면 멈춘다(자동 추종 금지)."""
    seen: dict[str, str] = {}
    for key, p in PINNED_INPUTS.items():
        ref = p["sha"] if p["sha"] == "922cce0" else f"origin/{p['branch']}"
        actual = resolve_sha(ref)
        if actual != p["sha"]:
            raise SystemExit(f"PIN_MISMATCH {key}: expected {p['sha']} got {actual} ({ref})")
        seen[key] = actual
    return seen


def load_input(key: str) -> tuple[list[dict[str, Any]], str]:
    p = PINNED_INPUTS[key]
    raw = git_show(p["sha"], p["path"])
    sha256 = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    if p["kind"] == "jsonl":
        rows = [json.loads(l) for l in raw.splitlines() if l.strip()]
    elif p["kind"] == "json-records":
        rows = json.loads(raw)["records"]
    elif p["kind"] == "json-catalog":
        rows = json.loads(raw)["all_candidates"]
    else:
        raise SystemExit(f"unknown kind {p['kind']}")
    return rows, sha256


# ── 문자열 · 거리 ─────────────────────────────────────────────────────────────
def norm(s: Any) -> str:
    s = unicodedata.normalize("NFKC", str(s or "")).lower()
    return re.sub(r"[^0-9a-z가-힣]+", "", s)


def norm_head(s: Any) -> str:
    """slogan 형 영문명("Haeundae Beach: The Busan representative")의 앞부분만."""
    s = unicodedata.normalize("NFKC", str(s or "")).lower()
    s = re.split(r"[:：(（\-–—]", s)[0]
    s = re.sub(r"\b(the|a|an|in|of)\b", "", s)
    return re.sub(r"[^0-9a-z가-힣]+", "", s)


def ko_part(s: Any) -> str:
    """Main 상호 'Mandeuri Gondeurebap (만드리곤드레밥)' 의 괄호 안 한글."""
    m = re.search(r"\(([^()]*[가-힣][^()]*)\)", str(s or ""))
    if m:
        return norm(m.group(1))
    return norm(s) if re.search(r"[가-힣]", str(s or "")) else ""


def km(a: Any, b: Any, c: Any, d: Any) -> float | None:
    try:
        a, b, c, d = float(a), float(b), float(c), float(d)
    except (TypeError, ValueError):
        return None
    R = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    h = math.sin(math.radians(c - a) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def to_float(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def strip_html(s: Any) -> str:
    t = re.sub(r"<[^>]+>", " ", str(s or ""))
    t = re.sub(r"&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;", lambda m: {"&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">"}[m.group(0)], t)
    return re.sub(r"\s+", " ", t).strip()


def write_jsonl(path: str, rows: Iterable[dict[str, Any]]) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
            n += 1
    return n


def write_json(path: str, obj: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=1) + "\n")


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


# ── 아티팩트 내부 쌍둥이(같은 장소가 두 레코드) ─────────────────────────────────
# 부산 NonFood 는 A(공식 API)·K(KTO)·VB(비짓부산 페이지)가 같은 장소를 각각 담고
# 있고(167쌍이 A↔VB), 서울·전주에도 동명·동위치 쌍이 있다. 둘 다 NEW 로 넣으면
# Main 에 중복이 생기므로 대표 하나만 intake 하고 나머지는 쓰지 않는다.
PREFIX_PRIORITY = {"A": 0, "K": 1, "E": 2, "VB": 3}


def twin_groups(rows: list[dict[str, Any]], *, name_keys: tuple[str, ...], lat_key: str, lng_key: str,
                id_key: str, max_m: float = 150.0, richer: Any = None) -> dict[str, str]:
    """canonical_id → 대표 canonical_id (자기 자신이 대표면 생략). 같은 정규화 이름 + 거리 ≤ max_m."""
    idx: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        keys = {norm(r.get(k)) for k in name_keys if norm(r.get(k))}
        # slogan 형 영문명은 머리만 비교한다
        for k in name_keys:
            if k.endswith("_en") and norm_head(r.get(k)):
                keys.add(norm_head(r.get(k)))
        for k in keys:
            idx.setdefault(k, []).append(r)
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for _k, group in idx.items():
        if len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                d = km(group[i].get(lat_key), group[i].get(lng_key), group[j].get(lat_key), group[j].get(lng_key))
                if d is not None and d <= max_m / 1000.0:
                    union(group[i][id_key], group[j][id_key])
    by_root: dict[str, list[dict[str, Any]]] = {}
    byid = {r[id_key]: r for r in rows}
    for cid in parent:
        by_root.setdefault(find(cid), []).append(byid[cid])
    out: dict[str, str] = {}
    for root, members in by_root.items():
        members.append(byid[root]) if byid[root] not in members else None
        def rank(r: dict[str, Any]) -> tuple:
            pre = r[id_key].split("-")[1] if r[id_key].count("-") >= 2 else ""
            rich = richer(r) if richer else 0
            return (PREFIX_PRIORITY.get(pre, 9), -rich, r[id_key])
        rep = sorted(members, key=rank)[0][id_key]
        for r in members:
            if r[id_key] != rep:
                out[r[id_key]] = rep
    return out


# ── Pre-Production Gate A: 쌍둥이 최종 판정 (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1) ──────
#
# twin_groups 는 "같은 정규화 이름 + ≤150m" 로 후보 묶음만 만든다. 여기서는 묶음마다
#   (1) 대표를 **근거 있는 규칙**으로 고르고 (배열/파일 순서 금지)
#   (2) 구성원마다 관계를 확정한다: SAME_ENTITY_TWIN / DISTINCT_ENTITY / TRUE_AMBIGUOUS
#
# 대표 선택 규칙(순서대로, 앞이 같으면 다음 기준):
#   1. provenance 등급 — entity 레코드(공식 API·시 카탈로그)가 page/article 레코드보다 앞 (부산 A<K<E<VB, 전주 OFF<KTO)
#   2. 깨끗한 고유명 — 괄호·따옴표·작가/기사 접두가 없는 한글명이 앞 (예: '아미동 비석마을' > '정승빈작가-아미동비석마을(…)')
#   3. 공개 가능 이미지 보유 수 많은 쪽
#   4. 설명문 보유(CSS 잔재 제외) 쪽
#   5. 공식 URL 보유 쪽
#   6. 동률이면 canonical_id 오름차순 (안정 tie-break)
#
# 관계 자동 규칙:
#   · 이름 동일 + 주소 동일(또는 포함) 또는 ≤30m → SAME_ENTITY_TWIN (HIGH)
#   · 이름 동일이지만 주소가 다르고 >30m → 자동으로 같은 장소로 보지 않는다 → TRUE_AMBIGUOUS
#     (explicit SAME 표에 근거가 적혀 있으면 SAME, DISTINCT 표에 있으면 DISTINCT_ENTITY)
#   · DISTINCT 표의 쌍은 묶음에서 풀어 각자 독립 레코드로 돌려보낸다.
NAME_NOISE_RE = re.compile(r"[()\[\]〈〉<>'‘’\"“”]|작가|추천|맛집|명소")


def norm_addr(a: Any) -> str:
    s = re.sub(r"\(.*?\)", "", str(a or ""))
    s = re.sub(r"(특별자치도|광역시|특별시|자치도|도|시|구|군)\b", "", s)
    return re.sub(r"\s+", "", s)


def name_is_clean(name: Any) -> bool:
    return bool(name) and not NAME_NOISE_RE.search(str(name))


def resolve_twins(rows: list[dict[str, Any]], *, name_keys: tuple[str, ...], lat_key: str, lng_key: str, id_key: str,
                  features: Any, addr_key: str, same_entity: dict[tuple[str, str], str], distinct: dict[tuple[str, str], str],
                  true_ambiguous: dict[str, str], max_m: float = 150.0, city: str = "") -> tuple[dict[str, str], list[dict[str, Any]]]:
    """returns (member → representative, resolution rows). resolution rows 는 대표 자신을 포함하지 않는다."""
    groups = twin_groups(rows, name_keys=name_keys, lat_key=lat_key, lng_key=lng_key, id_key=id_key, max_m=max_m)
    byid = {r[id_key]: r for r in rows}
    members: dict[str, list[str]] = {}
    for m, rep in groups.items():
        members.setdefault(rep, []).append(m)

    def rank(cid: str) -> tuple:
        f = features(byid[cid])
        return (int(f.get("prov", 9)), 0 if name_is_clean(f.get("name_ko")) else 1, -int(f.get("img", 0)),
                -int(f.get("desc", 0)), -int(f.get("url", 0)), cid)

    def pair_key(a: str, b: str) -> tuple[str, str]:
        return (a, b) if a <= b else (b, a)

    out_map: dict[str, str] = {}
    resolution: list[dict[str, Any]] = []
    for rep0, mem in sorted(members.items()):
        group = sorted([rep0, *mem])
        # DISTINCT 표에 있는 레코드는 묶음에서 분리한다
        detached: list[str] = []
        core: list[str] = []
        for cid in group:
            if any(pair_key(cid, o) in distinct for o in group if o != cid):
                detached.append(cid)
            else:
                core.append(cid)
        # 2건짜리 묶음이 통째로 DISTINCT 면 core 가 비고, 둘 다 독립 레코드로 돌아간다
        rep = sorted(core, key=rank)[0] if core else None
        for cid in detached:
            other = next(o for o in group if o != cid and pair_key(cid, o) in distinct)
            resolution.append({"city": city, "member_canonical_id": cid, "representative_canonical_id": None,
                               "relation": "DISTINCT_ENTITY", "reason": distinct[pair_key(cid, other)],
                               "evidence": _twin_evidence(byid[cid], byid[other], lat_key, lng_key, addr_key, name_keys),
                               "source_type": str(features(byid[cid]).get("source_type")), "category": byid[cid].get("category"),
                               "confidence": "HIGH", "deterministic_rule": "explicit_distinct_table", "runtime_write": True,
                               "notes": f"twin candidate of {other} — 다른 entity 로 확정, 독립 레코드로 write"})
        if rep is None:
            continue
        for cid in core:
            if cid == rep:
                continue
            out_map[cid] = rep
            ev = _twin_evidence(byid[cid], byid[rep], lat_key, lng_key, addr_key, name_keys)
            key = pair_key(cid, rep)
            if cid in true_ambiguous:
                rel, reason, conf, rule = "TRUE_AMBIGUOUS", true_ambiguous[cid], "LOW", "explicit_true_ambiguous_table"
            elif key in same_entity:
                rel, reason, conf, rule = "SAME_ENTITY_TWIN", same_entity[key], "MEDIUM", "explicit_same_entity_table"
            elif ev["address_same"] or ev["distance_m"] <= 30:
                rel, reason, conf, rule = "SAME_ENTITY_TWIN", "same normalized name + same address(or ≤30m) + same category", "HIGH", "auto:name+address_or_30m"
            else:
                rel, reason, conf, rule = "TRUE_AMBIGUOUS", "same name but different registered address and >30m — artifact 만으로 같은 장소 확정 불가", "LOW", "auto:name_only_address_differs"
            resolution.append({"city": city, "member_canonical_id": cid, "representative_canonical_id": rep, "relation": rel,
                               "reason": reason, "evidence": ev, "source_type": str(features(byid[cid]).get("source_type")),
                               "category": byid[cid].get("category"), "confidence": conf, "deterministic_rule": rule,
                               "runtime_write": False,
                               "notes": "대표만 write; 이 행은 SKIP" if rel == "SAME_ENTITY_TWIN" else "판정 전까지 SKIP(대표는 write) — 삭제·병합 아님"})
    return out_map, resolution


def _twin_evidence(a: dict[str, Any], b: dict[str, Any], lat_key: str, lng_key: str, addr_key: str, name_keys: tuple[str, ...]) -> dict[str, Any]:
    d = km(a.get(lat_key), a.get(lng_key), b.get(lat_key), b.get(lng_key))
    na, nb = norm_addr(a.get(addr_key)), norm_addr(b.get(addr_key))
    same_addr = bool(na and nb and (na == nb or na in nb or nb in na))
    return {"distance_m": round((d or 0) * 1000), "address_same": same_addr,
            "member_address": a.get(addr_key), "representative_address": b.get(addr_key),
            "member_name": {k: a.get(k) for k in name_keys}, "representative_name": {k: b.get(k) for k in name_keys},
            "category_same": a.get("category") == b.get("category")}
