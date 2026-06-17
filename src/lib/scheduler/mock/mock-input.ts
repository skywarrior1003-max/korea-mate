// GoKoreaMate / gokoreamate.com — Scheduler Mock Input
// TASK-013: Rule-based Scheduler v1
// Busan 1-day scenario: BIFF at 14:00 anchor + greedy fill

import type { SchedulerInput } from "../types";

export const MOCK_SCHEDULER_INPUT: SchedulerInput = {
  trip_date:       "2026-10-04",
  start_time:      "09:00",
  end_time:        "22:00",
  pace:            "normal",
  base_coordinate: { lat: 35.1796, lng: 129.0756 }, // Busan City Hall

  anchors: [
    {
      place_id:   "place-biff-square",
      start_time: "14:00",
      end_time:   "16:00",
      is_fixed:   true,
    },
  ],

  fixed_events: [
    {
      event_id:   "event-biff-opening-2026",
      start_time: "19:00",
      end_time:   "21:00",
      coordinate: { lat: 35.1580, lng: 129.1604 },
      zone_id:    1,
    },
  ],

  candidates: [
    {
      place_id:   "place-haeundae-beach",
      category:   "attraction",
      coordinate: { lat: 35.1587, lng: 129.1604 },
      zone_id:    1,
      score:      95,
    },
    {
      place_id:   "place-jagalchi-market",
      category:   "food",
      coordinate: { lat: 35.0962, lng: 129.0302 },
      zone_id:    2,
      score:      88,
    },
    {
      place_id:   "place-gamcheon-village",
      category:   "attraction",
      coordinate: { lat: 35.0975, lng: 129.0108 },
      zone_id:    2,
      score:      82,
    },
    {
      place_id:   "place-haedong-yonggungsa",
      category:   "temple",
      coordinate: { lat: 35.1880, lng: 129.2233 },
      zone_id:    3,
      score:      79,
    },
    {
      place_id:   "place-gwangalli-beach",
      category:   "nightview",
      coordinate: { lat: 35.1531, lng: 129.1187 },
      zone_id:    1,
      score:      74,
    },
    {
      place_id:   "place-biff-cafe",
      category:   "cafe",
      coordinate: { lat: 35.1580, lng: 129.1602 },
      zone_id:    1,
      score:      71,
    },
  ],

  affiliate_context: {
    affiliate_link_ids: ["aff-001-busan-hotel", "aff-002-tour-bus"],
    max_cards: 2,
  },
};
