// Home Experience 공용 타입.
//
// selector·컴포넌트·테스트가 같은 모양을 보게 하려고 한 곳에 모았다.
// DB 스키마에 없는 필드는 여기에도 없다 — 없는 값을 타입으로 먼저 만들어
// 두면 나중에 화면이 빈 문자열을 그리게 된다.

import type { ItineraryRow } from "@/lib/supabase";
import type { TripMoment } from "@/lib/trip-moments";

/** Page 1 이 어떤 화면인지. Page 2 는 항상 Discovery 라 여기 없다. */
export type Page1Kind = "storytelling" | "memory";

export interface HomeExperienceState {
  page1: Page1Kind;
  /** page1 === "memory" 일 때만 채워진다 */
  trip?: ItineraryRow;
  moments: TripMoment[];
}

/**
 * selector 입력. 전부 주입형이라 next/navigation·fetch 없이 테스트할 수 있다.
 *
 * finishSignalOf 가 별도 인자인 이유: "여행이 끝났다" 는 판정을 selector 가
 * 스스로 하면 안 되기 때문이다. 날짜로 추정하는 순간 사용자가 하지 않은 결정을
 * 대신 내리게 된다. 운영에서는 이 함수가 항상 false 를 돌려준다.
 */
export interface HomeExperienceInput {
  trips: readonly ItineraryRow[];
  momentsOf: (itineraryId: string) => readonly TripMoment[];
  finishSignalOf: (itineraryId: string) => boolean;
}

/**
 * 장소별로 저장된 감성 문구가 들어올 자리.
 *
 * 지금은 이 값을 만드는 API 도 저장소도 없다. 그래서 항상 비어 있고, 비면
 * 화면에서 블록을 숨긴다. 가짜 문구로 채우지 않는다. 문구 생성·저장이 생기면
 * 이 타입에 맞춰 넣기만 하면 된다.
 */
export interface SavedStoryCopy {
  momentId: string;
  /** 사용자가 저장을 확정한 문구만. 초안·미저장 상태는 여기 오지 않는다 */
  text: string;
  /** 공용 문구인지 개인화 문구인지 — 개인화는 다른 사용자에게 재사용 금지 */
  scope: "shared" | "personal";
}

/** 도시 카드 한 장. 사진이 없는 도시는 asset 이 null 이고 CityCardArt 로 그린다 */
export interface DiscoveryCity {
  slug: string;
  label: string;
  /** 권리 확인된 이미지 경로. 없으면 null */
  imageSrc: string | null;
  /** 이미지 출처 표기. imageSrc 가 있을 때만 */
  attribution: string | null;
  /** AI 플래너가 지원하는 도시인지 — Coming Soon 배지 판정 */
  plannerReady: boolean;
}
