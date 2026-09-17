// canonical city slug resolver (MYTRIP-CITY-CANONICALIZATION-V1, 2026-09-17)
//
// 계약(Owner):
//  · 내부 식별자(저장·URL·기능 판정)는 항상 canonical slug — CITY_SLUGS 5개.
//  · 표시 이름은 UI locale 몫(tripForm.city_* 라벨) — 이 모듈은 그 라벨을
//    **역방향 alias 로 파생**해 과거에 라벨로 저장된 값(예: city="부산")을
//    읽기 시점에 slug 로 되돌린다. 별도 도시 목록을 새로 만들지 않는다 —
//    alias 의 SSOT 는 기존 locale 메시지의 tripForm.city_* 값 그대로다.
//  · fuzzy 금지: trim + 라틴 대소문자 정규화 후 **완전 일치**만. 부분 문자열·
//    유사 철자·좌표 추정 없음. 미확인 값은 null (임의 기본 도시 금지).
//  · DB 원본은 손대지 않는다 — 호출자는 읽기 시점에만 이 함수를 쓴다.
// 값 import 는 확장자 포함 상대 경로 + json import attribute — node --test(strip-types)가
// 이 모듈을 직접 실행할 수 있게 하는 기존 lib 테스트 관례(place-source 등)와 동일.
import { CITY_SLUGS, type CitySlug } from "./index.ts";
import ko from "../../messages/ko.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import ja from "../../messages/ja.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };

/** tripForm.city_<Cap> — CityHub·플래너가 쓰는 기존 라벨 키 관례 그대로 */
export function cityLabelKey(slug: CitySlug): string {
  return `city_${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
}

function norm(v: string): string {
  return v.trim().toLowerCase();
}

const ALIAS: ReadonlyMap<string, CitySlug> = (() => {
  const m = new Map<string, CitySlug>();
  const bundles = [ko, en, ja, zh] as Array<{ tripForm?: Record<string, string> }>;
  for (const slug of CITY_SLUGS) {
    m.set(norm(slug), slug); // canonical 자기 자신
    const key = cityLabelKey(slug);
    for (const b of bundles) {
      const label = b.tripForm?.[key];
      if (typeof label === "string" && label.trim()) m.set(norm(label), slug);
    }
  }
  return m;
})();

/**
 * 저장값·입력값 → canonical slug. 확인되지 않으면 null.
 * (기존 제품이 실제 저장한 형태 = slug 또는 4개 locale 라벨뿐 — 그 외 별칭은
 *  실사용 근거가 확인될 때에만 추가한다. 발명 금지.)
 */
export function resolveCitySlug(input: string | null | undefined): CitySlug | null {
  if (typeof input !== "string") return null;
  const v = norm(input);
  if (!v) return null;
  return ALIAS.get(v) ?? null;
}
