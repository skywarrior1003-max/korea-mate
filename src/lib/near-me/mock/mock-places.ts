// GoKoreaMate / gokoreamate.com — Near Me Mock Place Data
// TASK-015: Near Me API Implementation
// 22 mock places around Haeundae beach base (35.1587, 129.1604).
// Zone distribution designed to test dynamic expansion logic:
//   Zone 1 (≤1km):  food × 1, cafe × 1, attraction × 1, walking × 1  → 4 total (<5 → Zone 2 when filtering single category)
//   Zone 2 (1-3km): all 9 categories × 1                               → 9 total
//   Zone 3 (3-7km): all 9 categories × 1                               → 9 total

import type { NearMePlaceRow } from "../types";

export const MOCK_NEAR_ME_PLACES: NearMePlaceRow[] = [
  // ── ZONE 1 — within ~1km of Haeundae base ────────────────────────────────
  {
    place_id: "mock-food-z1",
    category: "food",
    lat:      35.1590,
    lng:      129.1610,
    district: "Haeundae",
    tags:     ["korean", "seafood"],
  },
  {
    place_id: "mock-cafe-z1",
    category: "cafe",
    lat:      35.1580,
    lng:      129.1615,
    district: "Haeundae",
    tags:     ["coffee", "dessert"],
  },
  {
    place_id: "mock-attraction-z1",
    category: "attraction",
    lat:      35.1593,
    lng:      129.1592,
    district: "Haeundae",
    tags:     ["beach", "landmark"],
  },
  {
    place_id: "mock-walking-z1",
    category: "walking",
    lat:      35.1575,
    lng:      129.1618,
    district: "Haeundae",
    tags:     ["promenade", "scenic"],
  },

  // ── ZONE 2 — 1-3km from base ──────────────────────────────────────────────
  {
    place_id: "mock-food-z2",
    category: "food",
    lat:      35.1700,
    lng:      129.1700,
    district: "Centum",
    tags:     ["bbq", "korean"],
  },
  {
    place_id: "mock-cafe-z2",
    category: "cafe",
    lat:      35.1460,
    lng:      129.1530,
    district: "Gwangalli",
    tags:     ["rooftop", "view"],
  },
  {
    place_id: "mock-attraction-z2",
    category: "attraction",
    lat:      35.1750,
    lng:      129.1660,
    district: "Centum",
    tags:     ["museum", "culture"],
  },
  {
    place_id: "mock-temple-z2",
    category: "temple",
    lat:      35.1720,
    lng:      129.1720,
    district: "Centum",
    tags:     ["buddhist", "traditional"],
  },
  {
    place_id: "mock-kpop-z2",
    category: "kpop",
    lat:      35.1550,
    lng:      129.1790,
    district: "Gwangalli",
    tags:     ["idol", "photobooth"],
  },
  {
    place_id: "mock-shopping-z2",
    category: "shopping",
    lat:      35.1480,
    lng:      129.1560,
    district: "Gwangalli",
    tags:     ["mall", "fashion"],
  },
  {
    place_id: "mock-nightview-z2",
    category: "nightview",
    lat:      35.1650,
    lng:      129.1730,
    district: "Centum",
    tags:     ["bridge", "lights"],
  },
  {
    place_id: "mock-walking-z2",
    category: "walking",
    lat:      35.1510,
    lng:      129.1560,
    district: "Gwangalli",
    tags:     ["waterfront", "trail"],
  },
  {
    place_id: "mock-rainy-z2",
    category: "rainy_day",
    lat:      35.1620,
    lng:      129.1720,
    district: "Centum",
    tags:     ["indoor", "cinema"],
  },

  // ── ZONE 3 — 3-7km from base ──────────────────────────────────────────────
  {
    place_id: "mock-food-z3",
    category: "food",
    lat:      35.1300,
    lng:      129.1380,
    district: "Suyeong",
    tags:     ["street-food", "market"],
  },
  {
    place_id: "mock-cafe-z3",
    category: "cafe",
    lat:      35.1900,
    lng:      129.1950,
    district: "Gijang",
    tags:     ["ocean-view", "specialty"],
  },
  {
    place_id: "mock-attraction-z3",
    category: "attraction",
    lat:      35.1880,
    lng:      129.2200,
    district: "Gijang",
    tags:     ["temple", "sunrise"],
  },
  {
    place_id: "mock-temple-z3",
    category: "temple",
    lat:      35.2100,
    lng:      129.1900,
    district: "Gijang",
    tags:     ["mountain", "buddhist"],
  },
  {
    place_id: "mock-kpop-z3",
    category: "kpop",
    lat:      35.1100,
    lng:      129.1200,
    district: "Suyeong",
    tags:     ["concert-venue", "merch"],
  },
  {
    place_id: "mock-shopping-z3",
    category: "shopping",
    lat:      35.1100,
    lng:      129.1450,
    district: "Suyeong",
    tags:     ["outlet", "discount"],
  },
  {
    place_id: "mock-nightview-z3",
    category: "nightview",
    lat:      35.2050,
    lng:      129.1800,
    district: "Gijang",
    tags:     ["hilltop", "panorama"],
  },
  {
    place_id: "mock-walking-z3",
    category: "walking",
    lat:      35.1200,
    lng:      129.1300,
    district: "Suyeong",
    tags:     ["coastal", "nature"],
  },
  {
    place_id: "mock-rainy-z3",
    category: "rainy_day",
    lat:      35.1250,
    lng:      129.2000,
    district: "Gijang",
    tags:     ["aquarium", "indoor"],
  },
];
