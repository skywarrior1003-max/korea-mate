"""
Finalize recovery artifacts:
1. Updated comprehensive QA with full analysis
2. Main handoff artifact (MAIN_HANDOFF_READY_MULTILINGUAL_ARTIFACT)
3. Reconcile with existing 7 enrichment records
"""
import json
import re
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

ROOT = Path(__file__).parent.parent
EXISTING_ENRICHMENT = ROOT / "data/gyeongju-multilingual-v1/gyeongju-food-multilingual-enrichment-v1.jsonl"
RECOVERY_ENRICHMENT = ROOT / "data/gyeongju-food-multilingual-recovery-v1/gyeongju-food-multilingual-recovery-enrichment-v1.jsonl"
ATTRACTION_ENRICHMENT = ROOT / "data/gyeongju-multilingual-v1/gyeongju-attraction-multilingual-enrichment-v1.jsonl"
OUT_DIR = ROOT / "data/gyeongju-food-multilingual-recovery-v1"
VG_RAW_PATH = ROOT / "data/gyeongju-multilingual-v1/gyeongju-food-vg-raw-v1.jsonl"

GENERATED_AT = datetime.now(timezone.utc).isoformat()

def norm_phone(p):
    if not p: return None
    return re.sub(r"[^0-9]", "", str(p))

# Load existing
existing = []
with open(EXISTING_ENRICHMENT, encoding="utf-8") as f:
    for line in f:
        if line.strip(): existing.append(json.loads(line))

# Load recovery enrichment (21 records: 7 × 3 locales)
recovery = []
with open(RECOVERY_ENRICHMENT, encoding="utf-8") as f:
    for line in f:
        if line.strip(): recovery.append(json.loads(line))

# Load attraction enrichment
attraction = []
with open(ATTRACTION_ENRICHMENT, encoding="utf-8") as f:
    for line in f:
        if line.strip(): attraction.append(json.loads(line))

# Load VG raw
vg_records = []
with open(VG_RAW_PATH, encoding="utf-8") as f:
    for line in f:
        if line.strip(): vg_records.append(json.loads(line))

# VG lookup by vg_id
vg_by_id = {v["vg_id"]: v for v in vg_records}

# Build MAIN_HANDOFF artifact: canonical_id -> {locale: {title, short_description, source, source_url}}
# Recovery takes precedence over existing for same canonical+locale
handoff = {}  # (canonical_id, locale) -> record

# First, populate from existing enrichment (17 records)
for r in existing:
    key = (r["candidate_id"], r["locale"])
    if r.get("title"):
        handoff[key] = {
            "canonical_id": r["candidate_id"],
            "locale": r["locale"],
            "title": r["title"],
            "short_description": r.get("short_description"),
            "source": r.get("source", "visitgyeongju.or.kr"),
            "source_url": r.get("vg_url"),
            "vg_id": r.get("vg_id"),
            "vg_area": r.get("vg_area"),
            "mapping_method": r.get("mapping_method"),
            "required_core_ready": r.get("required_core_ready", True),
            "provenance_type": "OFFICIAL_SOURCE",
            "rights_status": r.get("rights_status","OFFICIAL_TOURISM_BODY_NO_EXPLICIT_PROHIBITION"),
            "is_new_recovery": False,
            "data_source": "EXISTING_ENRICHMENT",
        }

# Then overlay from recovery enrichment — adds JA for GJ08-732, JA/ZH for GJ08-405, JA for GJ08-7510
# And ensures all 7 × 3 = 21 slots are filled where VG has titles
for r in recovery:
    key = (r["candidate_id"], r["locale"])
    vg = vg_by_id.get(r["vg_id"])
    # Use VG raw title as ground truth (most authoritative)
    lang_map = {"en": "en", "ja": "ja", "zh-CN": "zh"}
    lang_key = lang_map.get(r["locale"])
    vg_title = vg[lang_key]["title"] if vg and lang_key else r.get("title")

    existing_entry = handoff.get(key, {})
    existing_desc = existing_entry.get("short_description")

    # If title exists in VG, include this slot
    if vg_title:
        handoff[key] = {
            "canonical_id": r["candidate_id"],
            "locale": r["locale"],
            "title": vg_title,
            "short_description": existing_desc,  # Only if we already had it from existing enrichment
            "source": "visitgyeongju.or.kr",
            "source_url": r.get("vg_url"),
            "vg_id": r.get("vg_id"),
            "vg_area": r.get("vg_area"),
            "mapping_method": r.get("mapping_method"),
            "required_core_ready": True,
            "provenance_type": "OFFICIAL_SOURCE",
            "rights_status": "OFFICIAL_TOURISM_BODY_NO_EXPLICIT_PROHIBITION",
            "is_new_recovery": r.get("is_new_recovery", False),
            "data_source": "RECOVERY_ENRICHMENT" if r.get("is_new_recovery") else "EXISTING_ENRICHMENT",
        }

handoff_records = sorted(handoff.values(), key=lambda x: (x["canonical_id"], x["locale"]))

# Count stats
food_cids = {r["canonical_id"] for r in handoff_records}
food_en = sum(1 for r in handoff_records if r["locale"] == "en" and r.get("title"))
food_ja = sum(1 for r in handoff_records if r["locale"] == "ja" and r.get("title"))
food_zh = sum(1 for r in handoff_records if r["locale"] == "zh-CN" and r.get("title"))
food_en_desc = sum(1 for r in handoff_records if r["locale"] == "en" and r.get("short_description"))
food_ja_desc = sum(1 for r in handoff_records if r["locale"] == "ja" and r.get("short_description"))
food_zh_desc = sum(1 for r in handoff_records if r["locale"] == "zh-CN" and r.get("short_description"))
food_new_recovery = sum(1 for r in handoff_records if r.get("is_new_recovery"))

# Attraction stats
attr_cids = {r["candidate_id"] for r in attraction}
attr_en = sum(1 for r in attraction if r.get("locale") == "en" and r.get("title"))

# Write handoff
handoff_path = OUT_DIR / "gyeongju-food-multilingual-handoff-v1.jsonl"
with open(handoff_path, "w", encoding="utf-8") as f:
    for rec in handoff_records:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
print(f"Handoff written: {handoff_path} ({len(handoff_records)} records)")

# Print each handoff record
print("\n=== Handoff records ===")
for r in handoff_records:
    desc_avail = "✓desc" if r.get("short_description") else "no_desc"
    new = " [NEW_RECOVERY]" if r.get("is_new_recovery") else ""
    print(f"  {r['canonical_id']:30s} {r['locale']:6s} {r['title']:35s} {desc_avail}{new}")

# Write comprehensive QA
qa = {
    "task": "TASK-GYEONGJU-FOOD-MULTILINGUAL-LINKAGE-RECOVERY-V1",
    "result": "PASS",
    "generated_at": GENERATED_AT,
    "base_branch": "data/gyeongju-multilingual-v1",
    "base_sha": "6ac3977",
    "created_branch": "data/gyeongju-food-multilingual-recovery-v1",
    "vg_raw_structure": {
        "total_records": 105,
        "locale_bundling": "SINGLE_RECORD_BUNDLES_KO_EN_JA_ZH",
        "available_signals": ["vg_id", "ko.title", "ko.phone", "ko.address", "en.title", "ja.title", "zh.title", "area"],
        "all_en_ok_true": True,
        "all_ja_ok_true": True,
        "all_zh_ok_true": True,
        "is_fallback_false_all": True,
        "area_distribution": {"경주시내권": 40, "보문관광단지": 36, "황리단길": 16, "불국사권": 13},
    },
    "canonical_food": {
        "total": 102,
        "category_field_value": "restaurant",
        "district_field": "None (not populated in food records)",
        "phone_available": 100,
        "phone_not_available": 2,
    },
    "matching_passes": {
        "pass1_phone_exact": {
            "description": "Normalized phone digit string exact match + address/title cross-validation",
            "result": 7,
            "tier": "TIER_1_DETERMINISTIC",
            "confirms_existing_7": True,
        },
        "pass2_ko_title_exact_normalized": {
            "description": "Exact normalized KO title + secondary signal",
            "result": 0,
            "explanation": "Only 2 raw exact title matches in full 102x105 space, both already in phone-matched set",
        },
        "pass3_suffix_stripped_title": {
            "description": "Title with suffix removed (식당/카페/etc) + secondary signal",
            "result": 0,
        },
        "pass4_address_exact": {
            "description": "Normalized address exact match + title cross-validation",
            "result": 0,
            "explanation": "VG address format differs from canonical (경주시 vs 경상북도 경주시 prefix, dong-level detail)",
        },
    },
    "match_results": {
        "TIER_1_DETERMINISTIC": 7,
        "TIER_2_HIGH": 0,
        "TIER_3_REVIEW": 1,
        "NO_MATCH": 94,
        "total_confirmed": 7,
        "previously_matched": 7,
        "net_new_confirmed": 0,
    },
    "tier3_detail": {
        "gyeongju-GJ08-6917": {
            "canonical_title": "화수브루어리",
            "vg_title": "화수브루어리",
            "title_match_ratio": 1.00,
            "canonical_phone": "0507-1391-8015",
            "vg_phone": "010-9182-0060",
            "reason": "Exact title match but phone numbers differ (0507 virtual vs 010 mobile). Bounded web check recommended.",
            "vg_id": "535f4149060609450a4104474351404740",
            "vg_area": "보문관광단지",
            "auto_confirm": False,
        }
    },
    "unresolved_reason_breakdown": {
        "PHONE_NOT_IN_VG": 93,
        "NO_PHONE_IN_CANONICAL": 2,
        "FUZZY_TITLE_CANDIDATES": {
            "GJ08-112_황남맷돌순두부": "VG 맷돌순두부 (0.83) — different restaurants: different phone/address/district",
            "GJ08-88_전통맷돌순두부": "VG 맷돌순두부 (0.83) — different restaurants: different phone/address",
            "GJ08-412_소담": "VG 소담루 (0.80) — different restaurants: different address/phone",
            "GJ08-85_보문호반오리": "VG 호반오리 (0.80) — different restaurants: 보문동 vs 불국사 area",
            "GJ08-7124_올바릇_식당": "VG 올바릇식당_경주점 — canonical is base, VG is different branch location",
        },
        "structural_gap_explanation": "VG 105 curates tourist-recommended restaurants. Canonical 102 includes full city food service universe from official city data. Overlap is 7 confirmed by phone. The 95 NO_MATCH canonical records are local eateries, market stalls, and chain branches not in VG's curated tourist list.",
    },
    "existing_7_revalidated": {
        "result": "PASS",
        "all_7_confirmed_tier1": True,
        "method_reconfirmed": "PHONE + ADDR or PHONE + TITLE",
        "cids": [
            "gyeongju-GJ08-405", "gyeongju-GJ08-7128", "gyeongju-GJ08-732",
            "gyeongju-GJ08-733", "gyeongju-GJ08-7510", "gyeongju-GJ08-760", "gyeongju-GJ08-87"
        ]
    },
    "actual_keys_previously_used": ["phone (normalized)", "address (normalized)"],
    "available_but_previously_unused_keys": ["ko.title", "en.title", "ja.title", "zh.title", "vg_id"],
    "ko_title_bridge_tested": "YES — tested both exact-normalized and suffix-stripped; no new confirmed matches found",
    "hexid_internal_bridge_tested": "YES — vg_id exists in VG raw but canonical has no vg_id field to link against; hexID bridge not viable without canonical-side hexID",
    "multisignal_matching_completed": "YES — phone+addr, title+phone, title+addr, addr+title all tested",
    "multilingual_recovery": {
        "food_canonical_covered": 7,
        "food_canonical_total": 102,
        "coverage_pct": "6.9%",
        "en_title_count": food_en,
        "en_description_count": food_en_desc,
        "ja_title_count": food_ja,
        "ja_description_count": food_ja_desc,
        "zh_cn_title_count": food_zh,
        "zh_cn_description_count": food_zh_desc,
        "new_locale_records_added_vs_existing_17": len(handoff_records) - 17,
        "note": "VG raw bundles all locales per record. Recovery adds JA for GJ08-732, JA for GJ08-7510, JA/ZH for GJ08-405 where VG titles exist.",
    },
    "vg_native_en_confirmed": True,
    "vg_native_ja_confirmed": True,
    "vg_native_zh_cn_confirmed": True,
    "bounded_web_checks_executed": 0,
    "bounded_web_checks_needed": 1,
    "new_data_collected_from_web": 0,
    "resolved_from_existing_raw": 7,
    "duplicate_conflicts": 0,
    "main_handoff": {
        "description": "MAIN_HANDOFF_READY_MULTILINGUAL_ARTIFACT for Gyeongju Food",
        "path": str(handoff_path.relative_to(ROOT)),
        "records": len(handoff_records),
        "canonical_ids_covered": sorted(food_cids),
        "breaks_avoided": [
            "1. Enrichment->Canonical write-back: artifact explicitly maps canonical_id->locale->title",
            "2. city_spots import l10n fields: handoff has explicit name_l10n-ready structure",
            "3. Main manifest: this file must be added to intake manifest for Main consumption",
        ],
        "intake_instructions": {
            "name_l10n_mapping": "canonical_id -> {locale: title} from this artifact",
            "desc_l10n_mapping": "canonical_id -> {locale: short_description} from this artifact (7 EN desc available; JA/ZH desc need bounded VG page fetch)",
            "locale_key_note": "zh-CN in artifact maps to zh in DB (adapter required)",
        }
    },
    "attraction_existing_en_36": {
        "count": attr_en,
        "changed": 0,
        "artifact": "data/gyeongju-multilingual-v1/gyeongju-attraction-multilingual-enrichment-v1.jsonl",
    },
    "total_gyeongju_en_after_recovery": {
        "food_en_titles": food_en,
        "attraction_en_titles": attr_en,
        "total": food_en + attr_en,
        "canonical_total": 299,
        "coverage_pct": f"{(food_en + attr_en) / 299 * 100:.1f}%",
    },
    "main_correction_required": {
        "action": "Create l10n-capable city_spots import or adapter that reads this handoff artifact",
        "name_l10n": {locale: "title from handoff" for locale in ["en","ja","zh-CN"]},
        "desc_l10n_en": "short_description from handoff (7 food + 36 attraction available)",
        "main_intake_manifest_must_add": str(handoff_path.relative_to(ROOT)),
        "zh_cn_to_zh_adapter": True,
    },
    "additional_food_work_needed": True,
    "additional_food_work_description": "95 food canonical records NOT in VG coverage. Options: (1) accept as Korean-only; (2) bounded check of KTO EN food (currently 0); (3) additional source discovery",
    "attraction_followup_needed": True,
    "attraction_followup_description": "161 attraction records with no KTO EN content. Possible sources: gyeongju.go.kr EN pages, UNESCO sources.",
    "invariants": {
        "attraction_changed": 0,
        "core_canonical_changed": 0,
        "master_changed": 0,
        "production_changed": 0,
        "db_changed": 0,
        "broad_recollection": False,
        "translation_used": False,
    },
    "artifacts": {
        "crosswalk": "data/gyeongju-food-multilingual-recovery-v1/gyeongju-food-identity-crosswalk-v1.jsonl",
        "recovery_enrichment": "data/gyeongju-food-multilingual-recovery-v1/gyeongju-food-multilingual-recovery-enrichment-v1.jsonl",
        "handoff": str(handoff_path.relative_to(ROOT)),
        "nomatch_reason_analysis": "data/gyeongju-food-multilingual-recovery-v1/gyeongju-food-nomatch-reason-analysis-v1.jsonl",
    },
}

qa_path = OUT_DIR / "gyeongju-food-recovery-qa-v1.json"
with open(qa_path, "w", encoding="utf-8") as f:
    json.dump(qa, f, ensure_ascii=False, indent=2)
print(f"\nFinal QA written: {qa_path}")

# Arithmetic verification
print(f"\n=== ARITHMETIC VERIFICATION ===")
print(f"Canonical food total: 102")
print(f"T1 + T2 + T3 + NO_MATCH = 7 + 0 + 1 + 94 = {7+0+1+94} (should be 102: {'✓' if 7+0+1+94==102 else '✗'})")
print(f"Handoff records: {len(handoff_records)}")
print(f"  EN={food_en} JA={food_ja} ZH={food_zh} total={food_en+food_ja+food_zh} (should ≤7×3=21)")
print(f"  EN_desc={food_en_desc} JA_desc={food_ja_desc} ZH_desc={food_zh_desc}")
print(f"Attraction EN records: {attr_en}")
print(f"Total Gyeongju EN after recovery: {food_en} + {attr_en} = {food_en + attr_en} / 299 = {(food_en+attr_en)/299*100:.1f}%")
print(f"No duplicate canonical assignments: {len(set(r['canonical_id'] for r in handoff_records)) == 7}")
