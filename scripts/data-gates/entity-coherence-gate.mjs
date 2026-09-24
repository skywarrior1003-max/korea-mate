#!/usr/bin/env node
// Entity Coherence Gate — 후보 한 행이 "하나의 실제 장소"인지 검사한다.
// (DATA-TRACK-OFF-17463-CONTAMINATION-CORRECTION-AND-PREVENTION-V1 §7)
//
// 배경: OFF-17463(메르밀진미집 본점)에서 서로 다른 entity 의 최고 필드가
// 한 행으로 조합돼 존재하지 않는 혼합 장소가 만들어졌다 — 음식점 이름·좌표
// (OFFICIAL) + 숙소 주소·이미지·(kto)좌표(다나하루, KTO 2571938) + 기관
// 대표번호(전주시청). 이 게이트는 그 유형을 승격 전에 기계적으로 막는다.
//
// 사용:
//   node scripts/data-gates/entity-coherence-gate.mjs <candidates.json>
//     — JSON 이 배열이면 그대로, 객체면 .all_candidates 를 검사한다.
//   exit 0 = 승격 가능(또는 이미지·전화만 배제하고 장소 데이터는 가능)
//   exit 2 = quarantine 필요 후보 존재(사유 출력)
//
// 원칙:
//  · AMBIGUOUS 는 경고가 아니라 차단 상태다 — identity_review=true 로 사람이
//    해소하기 전에는 Final 승격·Production export 금지.
//  · display_eligible:false / rights 불명 이미지는 hard gate.
//  · category ↔ source content type 불일치(FOOD↔숙박 등)면 그 원천의 필드를
//    어떤 것도 채택하지 않는다.
//  · 기관 대표번호는 개별 업체 전화가 아니다.
//  · 이미지 없음은 정상 상태다 — 잘못된 사진보다 안전하다.

import { readFileSync } from "node:fs";

/** 지자체·관광기관 대표번호 — 개별 장소 phone 으로 자동 채택 금지 (§7-5) */
export const GOVERNMENT_PHONES = new Set([
  "063-222-1000", // 전주시청 대표(천년전주 콜센터)
  "064-120",      // 제주 120
  "051-120",      // 부산 120
  "02-120",       // 서울 다산
  "054-779-6100", // 경주시 관광안내
  "1330",         // 관광공사 헬프라인
]);

/** KTO 숙박 계열 content type — FOOD/restaurant 후보와 결합 금지 (§7-3) */
const LODGING_TYPES = new Set(["숙박", "32", "B02010100"]);
const DOMAIN_INCOMPATIBLE = [
  { domain: /^(FOOD|restaurant)$/i, ktoType: LODGING_TYPES },
  { domain: /^(EVENT)$/i, ktoType: new Set(["관광지", "12"]) },
];

/** 좌표 거리(m) — 근사 평면 계산이면 충분하다(임계 판정용) */
export function distMeters(lat1, lng1, lat2, lng2) {
  const dy = (Number(lat1) - Number(lat2)) * 111320;
  const dx = (Number(lng1) - Number(lng2)) * 111320 * Math.cos((Number(lat1) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** 기본 임계값 — 호출부가 조정 가능(§7-4 configurable) */
export const DEFAULTS = { coordConflictMeters: 30 };

/**
 * 후보 한 행을 검사한다.
 * @returns {{ id: string, verdicts: string[], quarantine: boolean,
 *             fieldExclusions: string[] }}
 *  quarantine=true → Final 승격·export 금지(사람 검토 대기).
 *  quarantine=false 라도 fieldExclusions 의 필드(image/phone)는 채택 금지.
 */
export function checkCandidate(c, opts = {}) {
  const th = { ...DEFAULTS, ...opts };
  const verdicts = [];
  const fieldExclusions = [];
  let quarantine = false;
  const id = c.candidate_id ?? c.id ?? "(no id)";
  const hasKto = Boolean(String(c.kto_cid ?? "").trim());

  // §7-2 AMBIGUOUS = 차단 상태
  if (c.match_type === "AMBIGUOUS" && c.identity_review !== true) {
    quarantine = true;
    verdicts.push("AMBIGUOUS_UNREVIEWED: match_type=AMBIGUOUS 이며 identity_review 미완 — Final 승격 금지");
  }

  // §7-3 category/content type 불일치 — 해당 원천 필드 전면 배제
  if (hasKto) {
    for (const rule of DOMAIN_INCOMPATIBLE) {
      if (rule.domain.test(String(c.domain ?? c.category ?? "")) && rule.ktoType.has(String(c.kto_type ?? c.contenttypeid ?? ""))) {
        quarantine = true;
        verdicts.push(`CATEGORY_MISMATCH: domain=${c.domain} vs kto_type=${c.kto_type ?? c.contenttypeid} — 교차 entity 필드 채택 금지`);
      }
    }
    // §7-1 entity atomicity: 주 좌표와 결합 원천 좌표의 거리
    if (c.lat && c.kto_lat) {
      const m = distMeters(c.lat, c.lng, c.kto_lat, c.kto_lng);
      const nameMatch = String(c.kto_title ?? "").includes(String(c.display_name ?? "\u0000"))
        || String(c.display_name ?? "").includes(String(c.kto_title ?? "\u0000"));
      if (m > th.coordConflictMeters && !nameMatch) {
        quarantine = true;
        verdicts.push(`COORD_ENTITY_CONFLICT: 결합 원천과 ${m.toFixed(1)}m 이격 + 이름 불일치('${c.kto_title}') — 인접 건물 자동 동일시 금지`);
      }
      if (m <= th.coordConflictMeters && !nameMatch) {
        quarantine = true;
        verdicts.push("NEAR_BUT_DIFFERENT_NAME: 임계 이내라도 이름·category 다르면 통과 금지");
      }
    }
  }

  // §7-5 phone sanity
  const phone = String(c.phone ?? "").trim();
  if (phone && GOVERNMENT_PHONES.has(phone)) {
    fieldExclusions.push("phone");
    verdicts.push(`GOVERNMENT_PHONE: ${phone} 은 기관 대표번호 — 개별 장소 phone 채택 금지`);
  }

  // §7-6 image hard gate
  const img = String(c.kto_image ?? c.image_url ?? "").trim();
  if (img) {
    if (c.display_eligible === false) {
      fieldExclusions.push("image");
      verdicts.push("IMAGE_NOT_ELIGIBLE: display_eligible=false 는 hard gate — 게시 금지");
    }
    if (/UNKNOWN|FORBIDDEN/i.test(String(c.rights_status ?? ""))) {
      fieldExclusions.push("image");
      verdicts.push(`IMAGE_RIGHTS: rights_status=${c.rights_status} — 게시 금지`);
    }
    if (hasKto && verdicts.some(v => v.startsWith("CATEGORY_MISMATCH"))) {
      fieldExclusions.push("image");
      verdicts.push("IMAGE_CROSS_ENTITY: 불일치 원천의 이미지 — 게시 금지(사진 없음이 정상값)");
    }
  }

  return { id, verdicts, quarantine, fieldExclusions: [...new Set(fieldExclusions)] };
}

export function checkAll(candidates, opts = {}) {
  return candidates.map(c => checkCandidate(c, opts)).filter(r => r.quarantine || r.verdicts.length > 0);
}

// ── CLI ──
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const file = process.argv[2];
  if (!file) { console.error("usage: entity-coherence-gate.mjs <candidates.json>"); process.exit(1); }
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed.all_candidates) ? parsed.all_candidates
    : parsed.candidate_id ? [parsed] : [];
  const findings = checkAll(list);
  const quarantined = findings.filter(f => f.quarantine);
  for (const f of findings) {
    console.log(`${f.quarantine ? "QUARANTINE" : "FIELD-EXCLUDE"} ${f.id}`);
    for (const v of f.verdicts) console.log(`  - ${v}`);
  }
  console.log(`\n검사 ${list.length} · quarantine ${quarantined.length} · field-exclusion-only ${findings.length - quarantined.length}`);
  process.exit(quarantined.length > 0 ? 2 : 0);
}
