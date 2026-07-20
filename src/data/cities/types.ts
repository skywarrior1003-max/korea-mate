/** 다국어 텍스트 컨테이너 — 없으면 기존 영어 필드로 fallback */
export interface LocalizedText {
  en: string;
  ko: string;
  ja?: string;
  zh?: string;
}

export interface CitySpot {
  id: number;
  name: string;
  category: "attraction" | "restaurant" | "event" | "accommodation" | "nature";
  city: string;
  district?: string;
  address: string;
  description: string;
  whyItMatters?: string;
  mapUrl: string;
  naverMapUrl?: string;
  durationMinutes?: number;
  bestTimeSlot?: string;
  openingHours?: { open: string; close: string } | null;
  tags?: string[];
  relatedSurvivalGuides?: string[];
  soloFriendly: boolean;
  foreignCardAccepted: boolean;
  cashOnly?: boolean;
  image?: string;
  lat?: number;
  lng?: number;
  // 비즈니스 퍼널
  officialUrl?: string;
  affiliateUrl?: string;
  affiliateProvider?: string;
  entryFee?: string;
  difficulty?: "easy" | "moderate" | "hard";
  subcategory?: string;
  // i18n 확장 필드 (optional — 없으면 위 영어 필드로 fallback)
  nameL10n?: LocalizedText;
  descriptionL10n?: LocalizedText;
  whyItMattersL10n?: LocalizedText;
  addressL10n?: LocalizedText;
}

export interface CityConfig {
  slug: string;
  name: string;
  nameKo: string;
  defaultCenter: { lat: number; lng: number };
  staticSpots: CitySpot[];
  seoDescription: string;
}
