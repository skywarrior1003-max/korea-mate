// 법적 문서(개인정보처리방침·이용약관) 공용 타입 (PRIVACY-TERMS-V1)
//
// 원칙: 코드·설정·실측으로 확인된 사실만 본문에 쓴다. 확인되지 않은 법적
// 정보(운영 주체·연락처·보관기간·준거법 등)는 ownerInput 마커로만 남기고
// 임의 작성하지 않는다. ownerInput 이 하나라도 남아 있으면 렌더러가
// "DRAFT — NOT FOR PRODUCTION" 배너를 강제 표시한다.

export type LegalLocale = "en" | "ko" | "ja" | "zh";

export interface LegalSection {
  /** 조항 번호 — 4개 언어에서 동일해야 한다(법적 의미 동기화) */
  no: number;
  title: string;
  /** 본문 문단들 */
  paragraphs: string[];
  /** 목록 항목(있으면 문단 뒤에 렌더) */
  items?: string[];
  /**
   * Owner 가 확정해야 하는 정보의 설명(사용자 노출용 아님 — DRAFT 화면에서
   * [OWNER INPUT REQUIRED] 박스로 표시). Production 게시 전 반드시 해소.
   */
  ownerInput?: string;
}

export interface LegalDoc {
  title: string;
  /** 시행일·최종 수정일 — Owner 확정 전 null */
  effectiveDate: string | null;
  lastUpdated: string | null;
  intro: string[];
  sections: LegalSection[];
}

export type LegalDocSet = Record<LegalLocale, LegalDoc>;

/** 문서에 ownerInput 잔존 여부 — DRAFT 판정의 단일 기준 */
export function hasOwnerInput(doc: LegalDoc): boolean {
  return doc.effectiveDate === null || doc.sections.some(s => s.ownerInput);
}
