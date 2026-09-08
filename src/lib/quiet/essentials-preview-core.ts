// Travel Essentials preview 2슬롯 선정 — 디자인 SSOT §6 (DISCOVERY-EXPLORE-PRODUCTION-V1)
//
// 규칙: [1순위] + [첫 카드와 **다른 성격**의 최상위]. 성격이 전부 같으면
// 서로 다른 소분류(category 문자열) 최상위, 그마저 없으면 정직하게 상위 2개.
// 없는 데이터(luggage/eSIM)를 발명하지 않는다 — 이 함수는 고르기만 한다.

export interface EssentialLike { category?: string | null }

/**
 * 소분류 문자열 → 성격(coarse kind). 결정적 키워드 규칙이다 — 새 분류 체계를
 * 만드는 게 아니라, "수단 둘"보다 "수단+결제"가 여행자에게 낫다는 다양성 판단만 한다.
 */
export function essentialKind(category: string | null | undefined): string {
  const c = (category ?? "").trim();
  if (!c) return "etc";
  if (/짐|보관|로커|수하물|luggage|locker/i.test(c)) return "luggage";
  if (/카드|패스|정기권|티켓|결제|pass|card/i.test(c)) return "pay";
  if (/안내|핫라인|전화|헬프|help|hotline/i.test(c)) return "help";
  if (/유심|esim|와이파이|wifi|통신/i.test(c)) return "connectivity";
  if (/철도|버스|택시|리무진|렌터카|교통|지하철|메트로|metro|bus|taxi|ktx|srt/i.test(c)) return "transport";
  return "etc";
}

/** 순서를 보존하며 2개를 고른다. 데이터가 2개 미만이면 있는 그대로. */
export function pickEssentialsPreview<T extends EssentialLike>(items: readonly T[]): T[] {
  if (items.length <= 2) return [...items];
  const first = items[0];
  const firstKind = essentialKind(first.category);
  const otherKind = items.slice(1).find(x => essentialKind(x.category) !== firstKind);
  if (otherKind) return [first, otherKind];
  const otherCat = items.slice(1).find(x => (x.category ?? "") !== (first.category ?? ""));
  if (otherCat) return [first, otherCat];
  return [first, items[1]];
}
