// One-shot: Visit Busan events 추가 + Jungkook hometown 숨김 처리 + displayUntil 필드 추가
const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "../public/data/events.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

// ── 1. Jungkook 고향 코스 5종 hidden 처리 ───────────────────────────────────
const JUNGKOOK_ROUTE_IDS = [
  "kpop-bts-001", // Baekyang School Pilgrimage
  "kpop-bts-002", // Seokbulsa Temple
  "kpop-bts-003", // Mandeok Pass Night View
  "kpop-bts-004", // Hwamyeong Arboretum
  "kpop-bts-005", // Hwamyeong Eco Park
];

let hiddenCount = 0;
data.forEach(e => {
  if (JUNGKOOK_ROUTE_IDS.includes(e.id)) {
    e.hidden = true;
    hiddenCount++;
    console.log(`hidden=true: ${e.id} (${e.shortName})`);
  }
});

// ── 2. 기존 mega-event displayUntil 추가 ────────────────────────────────────
const DISPLAY_UNTIL_MAP = {
  "mega-event-016": "2026-06-13", // The Red Moment
  "mega-event-017": "2026-06-14", // Port Village
  "mega-event-018": "2026-08-31", // Starry Sea Night Market
  "mega-event-019": "2026-06-30", // Busan Gourmet Selection
  "evt-drone-001":  "2026-06-13", // Gwangalli M Drone Show
  "evt-anchor-001": "2026-06-13", // BTS Concert anchor
  "evt-pre-001":    "2026-06-12", // Pre-show event
  "evt-pre-003":    "2026-06-12",
  "evt-day-001":    "2026-06-13",
  "evt-post-001":   "2026-06-13",
  "evt-post-002":   "2026-06-14",
  "evt-fest-001":   "2026-06-14",
};

data.forEach(e => {
  if (DISPLAY_UNTIL_MAP[e.id]) {
    e.displayUntil = DISPLAY_UNTIL_MAP[e.id];
    console.log(`displayUntil=${e.displayUntil}: ${e.id}`);
  }
});

// ── 3. 새 Visit Busan 이벤트 추가 ─────────────────────────────────────────
const existingIds = new Set(data.map(e => e.id));

const NEW_EVENTS = [
  {
    id: "visit-busan-001",
    type: "event",
    isAnchor: false,
    journeyCluster: "bts-busan-2026",
    stage: "Pre-Event",
    anchorEventId: "evt-anchor-001",
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "✈️ [VisitBusan Welcome] Gimhae Airport ARMY Welcome Center",
    shortName: "✈️ Gimhae Airport Welcome Center",
    tags: ["#BTS", "#ARMY", "#VisitBusan", "#Welcome", "#Airport", "#ArmyTrip", "#Gimhae", "#BTS_THE_CITY"],
    city: "Busan",
    district: "Gangseo-gu",
    address: "Gimhae International Airport, Arrival Hall (김해국제공항 도착층)",
    mapUrl: "https://maps.google.com/?q=Gimhae+International+Airport+Busan+Korea",
    description: "Official Visit Busan ARMY welcome center at Gimhae Airport. Operated June 9–13, 2026 as part of BTS THE CITY / ARIRANG BUSAN program. Pick up official welcome materials, BTS THE CITY merch info, and city guides. Staff on-site to assist ARMY travelers.",
    whyItMatters: "First stop for ARMY arriving by air — the official welcome desk greets you with city guides and BTS THE CITY program info the moment you land.",
    recommendedDurationMinutes: 20,
    bestTimeSlot: "morning",
    openingHours: "TBA (June 9–13, arrival hall operating hours)",
    image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400",
    startDate: "2026-06-09",
    endDate: "2026-06-13",
    displayUntil: "2026-06-13",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 98,
    notice: "Free. No registration required. Check Visit Busan official site for exact booth location within the airport.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null
    }
  },
  {
    id: "visit-busan-002",
    type: "event",
    isAnchor: false,
    journeyCluster: "bts-busan-2026",
    stage: "Pre-Event",
    anchorEventId: "evt-anchor-001",
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🚆 [VisitBusan Welcome] Busan Station Eurasia Welcome Center",
    shortName: "🚆 Busan Station Eurasia Welcome Center",
    tags: ["#BTS", "#ARMY", "#VisitBusan", "#Welcome", "#BusanStation", "#KTX", "#ArmyTrip", "#BTS_THE_CITY"],
    city: "Busan",
    district: "Dong-gu",
    address: "Busan Station, Eurasia Plaza (부산역 유라시아 플라자)",
    mapUrl: "https://maps.google.com/?q=Busan+Station+Eurasia+Plaza+Korea",
    description: "Official Visit Busan ARMY welcome center at Busan Station's Eurasia Plaza. Operated June 9–13, 2026. The prime arrival point for travelers coming by KTX. Collect BTS THE CITY program information, Busan maps, and welcome gifts.",
    whyItMatters: "Essential stop for ARMY arriving by KTX — the Eurasia Plaza welcome center is the gateway to BTS THE CITY Busan events.",
    recommendedDurationMinutes: 20,
    bestTimeSlot: "morning",
    openingHours: "TBA (June 9–13)",
    image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
    startDate: "2026-06-09",
    endDate: "2026-06-13",
    displayUntil: "2026-06-13",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 96,
    notice: "Free. Check Visit Busan official site for booth hours.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null
    }
  },
  {
    id: "visit-busan-003",
    type: "event",
    isAnchor: false,
    journeyCluster: "bts-busan-2026",
    stage: "Pre-Event",
    anchorEventId: "evt-anchor-001",
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🎊 [VisitBusan Welcome] Busan Station Plaza Welcome Event",
    shortName: "🎊 Busan Station Plaza Welcome Event",
    tags: ["#BTS", "#ARMY", "#VisitBusan", "#Welcome", "#BusanStation", "#ArmyTrip", "#BTS_THE_CITY", "#Plaza"],
    city: "Busan",
    district: "Dong-gu",
    address: "Busan Station Plaza (부산역 광장)",
    mapUrl: "https://maps.google.com/?q=Busan+Station+Plaza+Korea",
    description: "Official outdoor welcome event in Busan Station Plaza, June 9–14, 2026. Part of the BTS THE CITY / ARIRANG BUSAN program. Live performances, interactive stations, and welcoming ceremonies for ARMY arriving in Busan. A festive atmosphere right outside the station.",
    whyItMatters: "Step off the KTX and walk straight into BTS THE CITY energy — the plaza transforms into a welcome festival for ARMY from around the world.",
    recommendedDurationMinutes: 45,
    bestTimeSlot: "afternoon",
    openingHours: "TBA (June 9–14)",
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400",
    startDate: "2026-06-09",
    endDate: "2026-06-14",
    displayUntil: "2026-06-14",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 97,
    notice: "Free outdoor event. Check Visit Busan for exact schedule.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null
    }
  },
  {
    id: "visit-busan-004",
    type: "event",
    isAnchor: false,
    journeyCluster: "bts-busan-2026",
    stage: "Pre-Event",
    anchorEventId: "evt-anchor-001",
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🎁 [VisitBusan] Busan Welcome Kit — BTS THE CITY ARMY Gift",
    shortName: "🎁 Busan Welcome Kit",
    tags: ["#BTS", "#ARMY", "#VisitBusan", "#WelcomeKit", "#Merch", "#ArmyTrip", "#BTS_THE_CITY", "#GiftBag"],
    city: "Busan",
    district: "Dong-gu",
    address: "Busan Station & Gimhae Airport Welcome Centers (부산역 / 김해공항)",
    mapUrl: "https://maps.google.com/?q=Busan+Station+Korea",
    description: "Official BTS THE CITY ARIRANG BUSAN welcome kit distributed at Busan Station and Gimhae Airport, June 9–13, 2026. Includes exclusive Busan city guide, BTS THE CITY event schedule, and limited ARMY welcome gifts from Visit Busan.",
    whyItMatters: "Limited-edition ARMY welcome package from Visit Busan — only available at official welcome centers during the concert period.",
    recommendedDurationMinutes: 15,
    bestTimeSlot: "morning",
    openingHours: "TBA (June 9–13, while supplies last)",
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400",
    startDate: "2026-06-09",
    endDate: "2026-06-13",
    displayUntil: "2026-06-13",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 98,
    notice: "Free. Limited supply. First-come, first-served at official welcome centers.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null
    }
  },
  {
    id: "visit-busan-005",
    type: "event",
    isAnchor: false,
    journeyCluster: "bts-busan-2026",
    stage: "Pre-Event",
    anchorEventId: "evt-anchor-001",
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🗺️ [VisitBusan] Busan Tourism Promotion Booth — BTS THE CITY",
    shortName: "🗺️ Busan Tourism Booth",
    tags: ["#BTS", "#ARMY", "#VisitBusan", "#TourismBooth", "#ArmyTrip", "#BTS_THE_CITY", "#EventDay"],
    city: "Busan",
    district: "Busan (event venue area)",
    address: "Asiad Main Stadium & surrounding venue area (아시아드 주경기장 일원)",
    mapUrl: "https://maps.google.com/?q=Asiad+Main+Stadium+Busan+Korea",
    description: "Official Visit Busan tourism promotion booths operated near the BTS concert venue (Asiad Main Stadium), June 9–14, 2026. Get curated restaurant lists, attraction guides, BTS THE CITY program maps, and special discount coupons for ARMY participants.",
    whyItMatters: "The official on-site guide to BTS THE CITY Busan — tourism experts help ARMY navigate the city and make the most of the extended festival period.",
    recommendedDurationMinutes: 20,
    bestTimeSlot: "afternoon",
    openingHours: "TBA (June 9–14, pre/post concert hours)",
    image: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=400",
    startDate: "2026-06-09",
    endDate: "2026-06-14",
    displayUntil: "2026-06-14",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 96,
    notice: "Free. Operated during concert hours. Check Visit Busan official site for full schedule.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null
    }
  },
  {
    id: "visit-busan-006",
    type: "festival",
    isAnchor: false,
    journeyCluster: "busan-mega-events",
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🍌 [VisitBusan Festival] 2026 Big Banana Busan Night Market (빅바나나 부산 나이트마켓)",
    shortName: "🍌 Big Banana Night Market",
    tags: ["#VisitBusan", "#NightMarket", "#BigBanana", "#BTS", "#KPop", "#SummerEvent", "#Busan", "#2026"],
    city: "Busan",
    district: "Busan (venue TBA)",
    address: "Busan (venue TBA — Check Visit Busan for location)",
    mapUrl: "https://maps.google.com/?q=Busan+Korea+Night+Market",
    description: "2026 Big Banana Busan Night Market (빅바나나 부산 나이트마켓) — an official Visit Busan summer night market event featuring K-POP stages, local food vendors, and interactive cultural experiences. Part of the extended BTS THE CITY Busan summer program.",
    whyItMatters: "Visit Busan's signature summer night market — bigger and more festive than ever as part of the BTS THE CITY 2026 program. Street food, K-POP performances, and summer night vibes.",
    recommendedDurationMinutes: 120,
    bestTimeSlot: "night",
    openingHours: "Evening (summer 2026 — check Visit Busan for exact dates)",
    image: "https://images.unsplash.com/photo-1519676867240-f03562e64548?w=400",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    displayUntil: "2026-08-31",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 90,
    notice: "Free to enter. Check Visit Busan official site for dates and venue.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null
    }
  }
];

let addedCount = 0;
NEW_EVENTS.forEach(e => {
  if (existingIds.has(e.id)) {
    console.log(`SKIP (already exists): ${e.id}`);
  } else {
    data.push(e);
    addedCount++;
    console.log(`Added: ${e.id} (${e.shortName})`);
  }
});

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log(`\nDone. hidden: ${hiddenCount}, added: ${addedCount}, total events: ${data.length}`);
