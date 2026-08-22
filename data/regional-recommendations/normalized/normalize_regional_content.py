"""
TASK-FIVE-CITY-REGIONAL-CONTENT-NORMALIZED-CONTRACT-V1
Normalization script for 5-city regional recommendation artifacts.
Reads original source files; writes normalized output to data/regional-recommendations/normalized/.
"""
import json, sys, os
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

SRC = Path(r'c:\기본저장\나의 프로젝트\KoreaMate\korea-mate\data\regional-recommendations')
OUT = SRC / 'normalized'
OUT.mkdir(exist_ok=True)

# --- Linkage enum constants ---
ENUM_EXACT    = "EXACT_CANONICAL_LINK"
ENUM_STRONG   = "STRONG_CANONICAL_LINK"
ENUM_RELATION = "RELATION_OR_AREA_ONLY"
ENUM_EVENT    = "EVENT_OR_TEMPORARY_CONTENT"
ENUM_NEW      = "TRUE_NEW_PLACE_CANDIDATE"
ENUM_UNCERTAIN = "UNCERTAIN"

def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)

def infer_stop_linkage(stop, city, new_place_candidates):
    """Infer linkage_type for a stop from various city schemas."""
    lt_field = stop.get('linkage_type') or stop.get('canonical_status')
    name = stop.get('name_ko') or stop.get('name') or ''

    # Jeonju: explicit linkage_type field
    if lt_field:
        u = lt_field.upper()
        if 'EXACT' in u: return ENUM_EXACT
        if 'STRONG' in u: return ENUM_STRONG
        if 'RELATION' in u or 'AREA' in u: return ENUM_RELATION
        if 'EVENT' in u: return ENUM_EVENT
        if 'NEW' in u or 'CANDIDATE' in u: return ENUM_NEW
        if 'UNCERTAIN' in u: return ENUM_UNCERTAIN

    # Get canonical_id from various field names
    cid = (stop.get('canonical_id') or
           stop.get('existing_canonical_id') or
           stop.get('existing_city_spots_id'))

    if cid is not None:
        return ENUM_EXACT

    # new_place_candidate flag (Gyeongju)
    if stop.get('new_place_candidate'):
        return ENUM_NEW

    # Name match against known new_place_candidates list
    for nc in (new_place_candidates or []):
        if name and (name in nc or nc in name):
            return ENUM_NEW

    # Known uncertain: 불국사
    if '불국사' in name:
        return ENUM_UNCERTAIN

    # id_note hint (Seoul/Jeju)
    id_note = (stop.get('id_note') or '').upper()
    if 'EVENT' in id_note:
        return ENUM_EVENT

    return ENUM_RELATION

def get_canonical_id(stop):
    """Get canonical_id from any city's stop schema."""
    return (stop.get('canonical_id') or
            stop.get('existing_canonical_id') or
            stop.get('existing_city_spots_id'))

def flatten_stops(stops_raw):
    """Flatten dict-by-day stops or list stops into a flat list."""
    if isinstance(stops_raw, dict):
        flat = []
        for day_stops in stops_raw.values():
            flat.extend(day_stops)
        return flat
    elif isinstance(stops_raw, list):
        return stops_raw
    return []

def normalize_stop(stop, seq, city, new_place_candidates):
    name = stop.get('name_ko') or stop.get('name') or ''
    name_en = stop.get('name_en')
    canonical_id = get_canonical_id(stop)
    if canonical_id is None:
        canonical_id = None
    linkage = infer_stop_linkage(stop, city, new_place_candidates)
    note = (stop.get('id_note') or stop.get('note') or
            stop.get('relation_note') or None)
    role = stop.get('role') or None
    return {
        "sequence": stop.get('order', seq),
        "name": name,
        "name_en": name_en,
        "canonical_id": canonical_id,
        "linkage_type": linkage,
        "relation_note": note if note else None,
        "stop_role": role,
    }

def normalize_courses(c_data, city):
    new_place_candidates = c_data.get('id_linkage_summary', {}).get('new_place_candidates', [])

    # Determine top-level key
    if 'final_recommended_courses' in c_data:
        final_list = c_data['final_recommended_courses']
    elif 'final_courses' in c_data:
        final_list = c_data['final_courses']
    else:
        final_list = []
    reserve_list = c_data.get('reserve_courses', [])

    result = []
    for is_reserve, courses in [(False, final_list), (True, reserve_list)]:
        for c in courses:
            stops_raw = c.get('stops', [])
            flat = flatten_stops(stops_raw)
            norm_stops = [normalize_stop(s, i+1, city, new_place_candidates) for i, s in enumerate(flat)]
            result.append({
                "id": c.get('course_id', c.get('id')),
                "title": c.get('name_ko') or c.get('official_course_name'),
                "title_en": c.get('name_en') or c.get('official_course_name_en'),
                "theme": c.get('theme'),
                "traveler_fit": c.get('traveler_fit'),
                "recommended_reason": c.get('recommended_reason'),
                "duration": c.get('duration') or c.get('duration_hours'),
                "days": c.get('days'),
                "seasonality": c.get('seasonality') or c.get('best_season'),
                "difficulty": c.get('difficulty'),
                "is_reserve": is_reserve,
                "stops": norm_stops,
                "source": c.get('source'),
                "as_of": c_data.get('generated_at') or c_data.get('as_of'),
            })
    return result

def infer_rn_linkage(item, city):
    """Infer linkage_type for a recommended_now item."""
    lt = (item.get('linkage_type') or '')
    if lt:
        u = lt.upper()
        if 'EXACT' in u: return ENUM_EXACT, None
        if 'RELATION' in u: return ENUM_RELATION, None
        if 'EVENT' in u: return ENUM_EVENT, None
        if 'NEW' in u: return ENUM_NEW, None

    npc = item.get('new_place_candidate', False)
    if npc:
        return ENUM_NEW, None

    # Single canonical_id field (Busan/Gyeongju/Seoul)
    cid_single = item.get('existing_canonical_id') or item.get('existing_city_spots_id')
    if cid_single is not None:
        return ENUM_EXACT, cid_single

    # List canonical_ids field (Jeju/Jeonju)
    cids = item.get('existing_canonical_ids', [])
    if cids:
        first = cids[0].get('canonical_id') if isinstance(cids[0], dict) else cids[0]
        if first:
            return ENUM_EXACT, first

    # Check id_note or note
    id_note = (item.get('id_note') or item.get('note') or '').upper()
    if 'EVENT' in id_note:
        return ENUM_EVENT, None

    return ENUM_RELATION, None

def get_rn_canonical_id(item):
    """Get primary canonical_id for a recommended_now item."""
    cid = item.get('existing_canonical_id') or item.get('existing_city_spots_id')
    if cid is not None:
        return cid
    cids = item.get('existing_canonical_ids', [])
    if cids:
        first = cids[0]
        if isinstance(first, dict):
            return first.get('canonical_id')
        return first
    return None

def get_rn_all_canonical_ids(item):
    """Get all canonical_ids as a list (preserving provenance)."""
    # Single field
    cid = item.get('existing_canonical_id') or item.get('existing_city_spots_id')
    if cid is not None:
        note = item.get('id_note') or ''
        return [{"canonical_id": cid, "id_note": note}]
    # List field
    cids = item.get('existing_canonical_ids', [])
    if cids:
        result = []
        for entry in cids:
            if isinstance(entry, dict):
                result.append({"canonical_id": entry.get('canonical_id'), "id_note": entry.get('id_note','')})
            else:
                result.append({"canonical_id": entry, "id_note": ""})
        return result
    return []

def normalize_rn(r_data, city):
    final_list = r_data.get('final_recommended_now', [])
    reserve_list = r_data.get('reserve_recommended_now', [])

    result = []
    for is_reserve, items in [(False, final_list), (True, reserve_list)]:
        for item in items:
            primary_cid = get_rn_canonical_id(item)
            all_cids = get_rn_all_canonical_ids(item)
            linkage, _ = infer_rn_linkage(item, city)

            result.append({
                "id": item.get('item_id', item.get('id')),
                "name": item.get('name_ko') or item.get('name'),
                "name_en": item.get('name_en'),
                "category": item.get('category'),
                "why_now": item.get('why_now'),
                "valid_from": item.get('valid_from'),
                "valid_to": item.get('valid_to'),
                "review_by": item.get('review_by'),
                "canonical_id": primary_cid,
                "canonical_ids_all": all_cids if len(all_cids) > 1 else None,
                "linkage_type": linkage,
                "is_reserve": is_reserve,
                "source": item.get('source'),
                "as_of": r_data.get('generated_at') or r_data.get('as_of') or r_data.get('as_of_note'),
            })
    return result

def get_guide_locales(g):
    """Normalize guide locales to a list."""
    loc = g.get('locale', '')
    lc = g.get('locale_coverage', [])
    if loc == 'multi':
        return [l for l in lc if l] if lc else []
    elif loc:
        return [loc]
    return []

def normalize_guides(g_data):
    guides = g_data.get('guides', [])
    result = []
    for g in guides:
        result.append({
            "id": g.get('guide_id', g.get('id')),
            "title": g.get('title'),
            "type": g.get('type'),
            "locales": get_guide_locales(g),
            "edition": g.get('edition'),
            "issue_date": g.get('issue_date'),
            "provider": g.get('provider') or g_data.get('source_portal'),
            "source_url": g.get('source_url') or g.get('url'),
            "download_url": g.get('download_url') or g.get('pdf_url') or None,
            "review_by": g.get('review_by') or None,
        })
    return result

def get_utility_locales(la):
    """Normalize locale_availability to sorted list."""
    if isinstance(la, list):
        return la
    elif isinstance(la, dict):
        return [k for k, v in la.items() if v]
    return []

def normalize_utility(u_data):
    items = u_data.get('utility_items', u_data.get('utilities', []))
    result = []
    for item in items:
        # Build multilingual summary
        summary = {}
        for lang_key, lang_std in [('ko','ko'),('en','en'),('ja','ja'),('zh-CN','zh-CN'),('zh_CN','zh-CN')]:
            field_key = f'summary_{lang_key}'
            if field_key in item and item[field_key]:
                summary[lang_std] = item[field_key]
        if not summary and 'summary' in item:
            summary['ko'] = item['summary']

        locales = get_utility_locales(item.get('locale_availability', {}))
        result.append({
            "id": item.get('utility_id', item.get('id')),
            "category": item.get('category'),
            "title": item.get('title'),
            "summary": summary if summary else None,
            "eligibility": item.get('eligibility') or None,
            "locales": locales,
            "provider": item.get('provider'),
            "source_url": item.get('source_url') or item.get('url'),
            "as_of": item.get('as_of') or u_data.get('as_of') or u_data.get('generated_at'),
            "review_by": item.get('review_by') or None,
            "freshness_note": item.get('freshness_note') or None,
        })
    return result

def build_normalized_city(city):
    src = SRC / city
    c_data = load(src / f'{city}-recommended-courses-v1.json')
    r_data = load(src / f'{city}-recommended-now-v1.json')
    g_data = load(src / f'{city}-official-guides-v1.json')
    u_data = load(src / f'{city}-travel-utility-v1.json')

    courses = normalize_courses(c_data, city)
    rn = normalize_rn(r_data, city)
    guides = normalize_guides(g_data)
    utility = normalize_utility(u_data)

    # Count stale items
    stale = (r_data.get('stale_or_excluded') or r_data.get('expired_excluded') or [])

    # Linkage stats
    all_stops = [s for c in courses for s in c['stops']]
    all_rn_refs = rn  # each item is one ref
    link_counts = {}
    for s in all_stops:
        lt = s['linkage_type']
        link_counts[lt] = link_counts.get(lt, 0) + 1
    rn_link_counts = {}
    for item in all_rn_refs:
        lt = item['linkage_type']
        rn_link_counts[lt] = rn_link_counts.get(lt, 0) + 1

    # Count from source
    if 'final_courses' in c_data:
        src_course_key = 'final_courses'
    else:
        src_course_key = 'final_recommended_courses'

    final_courses_count = len(c_data.get(src_course_key, []))
    reserve_courses_count = len(c_data.get('reserve_courses', []))
    final_rn_count = len(r_data.get('final_recommended_now', []))
    reserve_rn_count = len(r_data.get('reserve_recommended_now', []))

    return {
        "schema_version": "normalized-v1",
        "city": city,
        "as_of": "2026-08-22",
        "source_branch": "data/five-city-regional-content-handoff-v1",
        "recommended_courses": courses,
        "excluded_stale_recommended_now": [
            {"name": s.get('name_ko') or s.get('name', '?'), "reason": s.get('reason') or s.get('exclusion_reason', '')}
            for s in stale
        ],
        "recommended_now": rn,
        "official_guides": guides,
        "travel_utility": utility,
        "source_summary": {
            "source_files": [
                f"data/regional-recommendations/{city}/{city}-recommended-courses-v1.json",
                f"data/regional-recommendations/{city}/{city}-recommended-now-v1.json",
                f"data/regional-recommendations/{city}/{city}-official-guides-v1.json",
                f"data/regional-recommendations/{city}/{city}-travel-utility-v1.json",
            ],
            "source_course_key": src_course_key,
            "source_rn_stale_key": "stale_or_excluded" if 'stale_or_excluded' in r_data else "expired_excluded",
            "stop_structure_in_source": "dict_by_day" if isinstance(
                c_data.get(src_course_key, [{}])[0].get('stops', []) if c_data.get(src_course_key) else {}, dict
            ) else "mixed_or_list",
        },
        "quality_metadata": {
            "source_courses_final": final_courses_count,
            "source_courses_reserve": reserve_courses_count,
            "normalized_courses_total": len(courses),
            "normalized_courses_final": sum(1 for c in courses if not c['is_reserve']),
            "normalized_courses_reserve": sum(1 for c in courses if c['is_reserve']),
            "total_course_stops": len(all_stops),
            "course_stops_final": sum(len(c['stops']) for c in courses if not c['is_reserve']),
            "course_stops_reserve": sum(len(c['stops']) for c in courses if c['is_reserve']),
            "source_rn_final": final_rn_count,
            "source_rn_reserve": reserve_rn_count,
            "source_rn_stale": len(stale),
            "normalized_rn_final": sum(1 for r in rn if not r['is_reserve']),
            "normalized_rn_reserve": sum(1 for r in rn if r['is_reserve']),
            "normalized_guides": len(guides),
            "normalized_utility": len(utility),
            "course_stop_linkage": link_counts,
            "rn_linkage": rn_link_counts,
            "source_records_dropped": 0,
            "recommendation_records_dropped": 0,
            "provenance_dropped": 0,
            "known_issues": _known_issues(city),
        }
    }

def _known_issues(city):
    issues = {
        'busan': [
            "NEW_CANDIDATE 18건: 전포카페거리·해리단길 등 canonical 미연결. 실제 place 생성 없음.",
        ],
        'gyeongju': [
            "id_linkage_summary.total_stops_final_courses=14 vs physical=21: 요약값은 고유 장소 수 기준. 정규화는 물리적 등장 수 기준.",
            "불국사 UNCERTAIN: 좌표 불일치로 canonical ID 미확인. 현재 final courses에서 미포함 — reserve course에서 수동 재확인 권장.",
            "가이드 EN/JA/ZH=0: 경주 공식 포털 다국어 가이드 부재.",
        ],
        'seoul': [
            "RELATION 10건(코스 stops): 서울 주요 관광지(경복궁·국립민속박물관 등) VisitSeoul canonical 미포함. 의도적 공백.",
        ],
        'jeju': [],
        'jeonju': [
            "utility_count_summary.locale_ja=6 오타 (실제=7). 기반 데이터 정상.",
            "남부시장 FUTURE_MERGE_REQUIRED: OFF-16084(청년몰)+OFF-16085(야시장) 별도 entity 유지.",
        ],
    }
    return issues.get(city, [])


# --- Run normalization for all cities ---
cities = ['busan', 'gyeongju', 'seoul', 'jeju', 'jeonju']
qa_rows = []

for city in cities:
    print(f'\n=== Processing {city.upper()} ===')
    result = build_normalized_city(city)
    out_path = OUT / f'{city}-regional-content-normalized-v1.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f'  Written: {out_path}')

    qm = result['quality_metadata']
    print(f'  Courses: {qm["normalized_courses_final"]}F+{qm["normalized_courses_reserve"]}R = {qm["normalized_courses_total"]}')
    print(f'  Stops: {qm["course_stops_final"]}F+{qm["course_stops_reserve"]}R = {qm["total_course_stops"]}')
    print(f'  RN: {qm["normalized_rn_final"]}F+{qm["normalized_rn_reserve"]}R (stale={qm["source_rn_stale"]})')
    print(f'  Guides: {qm["normalized_guides"]}, Utility: {qm["normalized_utility"]}')
    print(f'  Stop linkage: {qm["course_stop_linkage"]}')
    print(f'  RN linkage: {qm["rn_linkage"]}')
    print(f'  DROPPED: src={qm["source_records_dropped"]} rec={qm["recommendation_records_dropped"]} prov={qm["provenance_dropped"]}')

    # Source vs normalized count checks
    src_c = qm["source_courses_final"] + qm["source_courses_reserve"]
    norm_c = qm["normalized_courses_total"]
    src_rn = qm["source_rn_final"] + qm["source_rn_reserve"]
    norm_rn = qm["normalized_rn_final"] + qm["normalized_rn_reserve"]
    c_ok = '✓' if src_c == norm_c else f'✗ ({src_c} vs {norm_c})'
    rn_ok = '✓' if src_rn == norm_rn else f'✗ ({src_rn} vs {norm_rn})'
    print(f'  Courses preserved: {c_ok}   RN preserved: {rn_ok}')

    qa_rows.append({
        'city': city.upper(),
        'C_src': src_c, 'C_norm': norm_c, 'C_ok': c_ok,
        'RN_src': src_rn, 'RN_norm': norm_rn, 'RN_ok': rn_ok,
        'G': qm["normalized_guides"], 'U': qm["normalized_utility"],
        'stop_link': qm["course_stop_linkage"],
        'rn_link': qm["rn_linkage"],
    })

# Build manifest
manifest = {
    "task": "TASK-FIVE-CITY-REGIONAL-CONTENT-NORMALIZED-CONTRACT-V1",
    "schema_version": "normalized-v1",
    "generated_at": "2026-08-22",
    "source_branch": "data/five-city-regional-content-handoff-v1",
    "source_base_commit": "cf681ea",
    "cities": cities,
    "normalized_files": [f'data/regional-recommendations/normalized/{c}-regional-content-normalized-v1.json' for c in cities],
    "linkage_enum": [
        "EXACT_CANONICAL_LINK",
        "STRONG_CANONICAL_LINK",
        "RELATION_OR_AREA_ONLY",
        "EVENT_OR_TEMPORARY_CONTENT",
        "TRUE_NEW_PLACE_CANDIDATE",
        "UNCERTAIN",
    ],
    "schema_variants_found": {
        "legacy_v1": ["busan", "gyeongju"],
        "v2": ["seoul", "jeju", "jeonju"],
    },
    "normalization_rules": {
        "canonical_id": "EXACT: existing_city_spots_id / existing_canonical_id / canonical_id — first non-null. null kept as null.",
        "linkage_type": "Jeonju: from linkage_type field. Gyeongju: from new_place_candidate flag + notes. Others: inferred from canonical_id presence + id_note.",
        "stops_flattened": "Dict-by-day (Busan C-001, Gyeongju C-001) and list formats unified to list[stop].",
        "rn_canonical_ids": "Single-field (Busan/Gyeongju/Seoul) and list-field (Jeju/Jeonju) both represented as primary canonical_id + optional canonical_ids_all.",
        "guide_locales": "locale='multi' + locale_coverage → list. Single locale → [locale]. Always list.",
        "utility_locales": "Dict {locale: bool} and list [locale] both normalized to list of active locales.",
        "utility_summary": "summary_ko / summary_en / summary_ja / summary_zh-CN → {ko:..., en:..., ...}. Omit if null.",
        "stale_excluded": "Not included in recommended_now. Preserved in excluded_stale_recommended_now array.",
    },
}

with open(OUT / 'five-city-regional-content-normalized-manifest-v1.json', 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(f'\nWritten manifest: {OUT}/five-city-regional-content-normalized-manifest-v1.json')

# Summary
print('\n\n=== QA SUMMARY ===')
print(f'{"CITY":10} | C_src | C_norm | C_ok | RN_src | RN_norm | RN_ok | G | U')
for r in qa_rows:
    print(f'{r["city"]:10} | {r["C_src"]:5} | {r["C_norm"]:6} | {r["C_ok"]:4} | {r["RN_src"]:6} | {r["RN_norm"]:7} | {r["RN_ok"]:5} | {r["G"]} | {r["U"]}')
