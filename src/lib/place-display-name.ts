// 사용자에게 보여 주는 장소 이름 — 화면 없이 (TASK-MY-TRIP-OWNER-SEMANTIC-P1-CORRECTION-V1).
//
// 두 가지만 한다.
//   1) locale 에 맞는 이름 고르기 — 실제 l10n 값이 있을 때만, 없으면 원문(번역을 만들지 않는다).
//   2) 수집 주석 떼기 — 일부 canonical 행의 KO 이름 끝에 인제스트 작업 메모
//      `(한,영,중간,중번,일)` 이 그대로 남아 있다(2026-08-30 READ-ONLY 감사: 부산 138 · 서울 1).
//      **정확히 그 어휘(한·영·중·일·중간·중번)만으로 이루어진 괄호 묶음이 이름 끝에 있을 때만** 뗀다.
//      임의의 괄호를 자르지 않는다 — "(해운대)" 같은 진짜 이름 일부는 그대로다.
//      데이터 원문은 고치지 않는다(DATA_CORRECTION_REQUIRED 로 보고) — 이것은 표시 바인딩이다.

import type { LocalizedText } from "@/data/cities/types";

const INGEST_LANG_TOKEN = "(?:한|영|중간|중번|중|일)";
const INGEST_ANNOTATION_RE = new RegExp(`\\s*\\(\\s*${INGEST_LANG_TOKEN}(?:\\s*,\\s*${INGEST_LANG_TOKEN})*\\s*\\)\\s*$`);

/** 이름 끝의 수집 주석 `(한,영,중간,중번,일)` 만 뗀다. 그 밖의 문자열은 그대로 돌려준다. */
export function stripIngestAnnotation(name: string): string {
  const out = name.replace(INGEST_ANNOTATION_RE, "").trim();
  return out.length > 0 ? out : name.trim();
}

/** 이 이름에 수집 주석이 남아 있는가 — 감사·보고용 */
export function hasIngestAnnotation(name: string | null | undefined): boolean {
  return typeof name === "string" && INGEST_ANNOTATION_RE.test(name);
}

/** l10n 객체 — 고정 키 인터페이스(LocalizedText)와 느슨한 Record 둘 다 받는다 */
export type L10nLike = LocalizedText | Record<string, string | null | undefined>;

/** l10n 객체에서 locale 값을 꺼낸다 — 비어 있으면 null. locale 은 "ko-KR" 도 "ko" 로 본다. */
export function pickL10n(l10n: L10nLike | null | undefined, locale: string): string | null {
  if (!l10n || typeof l10n !== "object") return null;
  const key = locale.toLowerCase().split(/[-_]/)[0]!;
  const v = (l10n as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * 화면용 장소 이름. 실제 l10n 값이 있을 때만 그것을, 없으면 원문 — 그리고 수집 주석을 뗀다.
 * 모든 surface(Explore 카드·지도 라벨·픽·타임라인·지도 미리보기·PlaceModal·/place)가 이 하나를 쓴다.
 */
export function displayPlaceName(
  name: string | null | undefined,
  nameL10n: L10nLike | null | undefined,
  locale: string,
): string {
  const base = (name ?? "").trim();
  const localized = pickL10n(nameL10n, locale);
  return stripIngestAnnotation(localized ?? base);
}

/** 설명/한 줄 소개 — 실제 l10n 값이 있을 때만, 없으면 원문(빈 값이면 null). 번역을 만들지 않는다. */
export function displayPlaceText(
  text: string | null | undefined,
  textL10n: L10nLike | null | undefined,
  locale: string,
): string | null {
  const localized = pickL10n(textL10n, locale);
  if (localized) return localized;
  const base = (text ?? "").trim();
  return base.length > 0 ? base : null;
}
