// One-shot script: add drone show + Visit Busan events to events.json
const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "../public/data/events.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const newEvents = [
  {
    id: "evt-drone-001",
    type: "event",
    isAnchor: false,
    journeyCluster: "bts-busan-2026",
    stage: "Post-Event",
    anchorEventId: "evt-anchor-001",
    relatedSpotIds: [12],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: {
      distanceKm: 6.4,
      walkMinutes: null,
      subwayMinutes: 14,
      taxiMinutes: 12,
      description: "14 min by subway (Line 2) from Asiad Main Stadium to Gwangalli Beach"
    },
    name: "Gwangalli M Drone Light Show 『BTS THE CITY ARIRANG BUSAN』",
    shortName: "광안리 M드론 라이트쇼",
    tags: [
      "#BTS", "#ARMY", "#KPop", "#DroneShow", "#NightEvent",
      "#PostConcert", "#Gwangalli", "#EventDay", "#VisitBusan"
    ],
    city: "Busan",
    district: "Suyeong-gu",
    address: "219 Gwanganbeolli-ro, Suyeong-gu, Busan (수영구 광안해변로 219, 광안리 해수욕장 일원)",
    mapUrl: "https://maps.google.com/?q=Gwangalli+Beach+Busan+Korea",
    description: "A spectacular 1,000-drone light show welcoming BTS's comeback — officially titled 『BTS THE CITY ARIRANG BUSAN』. Produced in collaboration with Visit Busan as part of the BTS THE CITY program. The drones create a massive aerial canvas over Gwangalli Beach at 22:00. Post-concert ARMY gathering point.",
    whyItMatters: "The official BTS comeback light show — 1,000 drones form BTS THE CITY artwork over the sea. Free to watch. The unmissable post-concert climax for any ARMY in Busan on June 12–13.",
    recommendedDurationMinutes: 60,
    bestTimeSlot: "night",
    openingHours: "22:00 (June 12–13 only)",
    image: "https://images.unsplash.com/photo-1579547621706-1a9c79d5c9f1?w=400",
    startDate: "2026-06-12",
    endDate: "2026-06-13",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 98,
    notice: "Free. No ticket required. Arrive by 21:30 — beach fills up fast. Bring a light jacket.",
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
    id: "mega-event-016",
    type: "event",
    isAnchor: false,
    journeyCluster: "busan-mega-events",
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🌊 [VisitBusan] The Red Moment Busan",
    shortName: "🌊 The Red Moment",
    tags: ["#VisitBusan", "#EventDay", "#BTS", "#KPop", "#NightEvent", "#Busan", "#2026"],
    city: "Busan",
    district: "Busan (venue TBA)",
    address: "Busan (venue TBA)",
    mapUrl: "https://maps.google.com/?q=Busan+Korea",
    description: "Official Visit Busan evening event (19:00–20:30) held June 11–13. Part of BTS THE CITY Busan program.",
    whyItMatters: "Exclusive Visit Busan BTS-linked evening event — limited access, special atmosphere.",
    recommendedDurationMinutes: 90,
    bestTimeSlot: "evening",
    openingHours: "19:00–20:30 (June 11–13)",
    image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400",
    startDate: "2026-06-11",
    endDate: "2026-06-13",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 92,
    notice: "Check Visit Busan official site for venue and ticket details.",
    commerce: {
      affiliateType: "none",
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: true,
      bookingUrl: null
    }
  },
  {
    id: "mega-event-017",
    type: "festival",
    isAnchor: false,
    journeyCluster: "busan-mega-events",
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "🚢 [VisitBusan Festival] Port Village Busan 2026",
    shortName: "🚢 Port Village Busan",
    tags: ["#VisitBusan", "#Festival", "#BusanPort", "#BTS", "#KPop", "#EventDay", "#Busan", "#2026"],
    city: "Busan",
    district: "Jung-gu",
    address: "Busan Port area (부산항 일대)",
    mapUrl: "https://maps.google.com/?q=Busan+Port+Korea",
    description: "Multi-cultural festival held at Busan Port from June 9–14, 2026. Official Visit Busan event linked to BTS THE CITY Busan program.",
    whyItMatters: "Busan Port transforms into a BTS THE CITY festival village — food, culture, and K-POP experiences.",
    recommendedDurationMinutes: 120,
    bestTimeSlot: "afternoon",
    openingHours: "TBA (June 9–14)",
    image: "https://images.unsplash.com/photo-1567521464027-f127ff144326?w=400",
    startDate: "2026-06-09",
    endDate: "2026-06-14",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 88,
    notice: "Free entry (some programs may require registration). Check Visit Busan for schedule.",
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
    id: "mega-event-018",
    type: "festival",
    isAnchor: false,
    journeyCluster: "busan-mega-events",
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: ["getting-around"],
    transitFromAnchor: null,
    name: "✨ [VisitBusan] 2026 Starry Sea Busan Night Market (별바다부산 나이트마켓)",
    shortName: "✨ Starry Sea Night Market",
    tags: ["#VisitBusan", "#NightMarket", "#Haeundae", "#BTS", "#KPop", "#SummerEvent", "#Busan", "#2026"],
    city: "Busan",
    district: "Haeundae-gu",
    address: "Haeundae area (해운대구 일대)",
    mapUrl: "https://maps.google.com/?q=Haeundae+Busan+Korea",
    description: "Busan's signature summer night market series running June–August 2026. Official Visit Busan event.",
    whyItMatters: "The most popular summer night market in Busan — food, K-POP performances, and sea views at Haeundae.",
    recommendedDurationMinutes: 90,
    bestTimeSlot: "night",
    openingHours: "Evening (June 1–Aug 31)",
    image: "https://images.unsplash.com/photo-1529543544282-ea669407fca3?w=400",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    isTrending: true,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 90,
    notice: "Free to enter. Check Visit Busan for exact dates and performances.",
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
    id: "mega-event-019",
    type: "festival",
    isAnchor: false,
    journeyCluster: "busan-mega-events",
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: ["payments"],
    transitFromAnchor: null,
    name: "🍽️ [VisitBusan] 2026 Busan Gourmet Selection (부산 고메 셀렉션)",
    shortName: "🍽️ Busan Gourmet Selection",
    tags: ["#VisitBusan", "#Food", "#Gourmet", "#Michelin", "#BusanEats", "#Busan", "#2026"],
    city: "Busan",
    district: "Busan (city-wide)",
    address: "Participating restaurants across Busan (부산 전역 참여 레스토랑)",
    mapUrl: "https://maps.google.com/?q=Busan+Korea",
    description: "Busan's premier gourmet dining event running June 4–30, 2026. Curated restaurants offer special menus. Official Visit Busan event.",
    whyItMatters: "Experience Busan's best restaurants at special event prices — from street food to fine dining.",
    recommendedDurationMinutes: 120,
    bestTimeSlot: "afternoon",
    openingHours: "June 4–30 (varies by restaurant)",
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400",
    startDate: "2026-06-04",
    endDate: "2026-06-30",
    isTrending: false,
    soloFriendly: true,
    foreignCardAccepted: true,
    cashOnly: false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 88,
    notice: "Reservations recommended for top restaurants. Check Visit Busan for participating venues.",
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

// Check for duplicates
newEvents.forEach(e => {
  if (data.find(x => x.id === e.id)) {
    console.log("SKIP (already exists):", e.id);
    return;
  }
});

const existingIds = new Set(data.map(e => e.id));
const toAdd = newEvents.filter(e => !existingIds.has(e.id));

// Insert drone show right after evt-post-001
const droneShow = toAdd.find(e => e.id === "evt-drone-001");
const others = toAdd.filter(e => e.id !== "evt-drone-001");

if (droneShow) {
  const postShowIdx = data.findIndex(e => e.id === "evt-post-001");
  if (postShowIdx >= 0) {
    data.splice(postShowIdx + 1, 0, droneShow);
    console.log("Inserted evt-drone-001 after evt-post-001 at index", postShowIdx + 1);
  } else {
    data.push(droneShow);
    console.log("Appended evt-drone-001");
  }
}

// Append others at end
others.forEach(e => {
  data.push(e);
  console.log("Appended", e.id);
});

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log("Total events:", data.length);
