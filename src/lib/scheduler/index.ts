// GoKoreaMate / gokoreamate.com — Scheduler Public API
// TASK-013: Rule-based Scheduler v1

export { runScheduler } from "./engine.ts";

export type {
  SchedulerInput,
  SchedulerResult,
  ScheduledDay,
  ScheduledItem,
  ScheduledItemType,
  StaySource,
  NearMeCandidate,
  TripAnchor,
  FixedEventItem,
  ItineraryItem,
  RouteTemplateStay,
  AffiliateContext,
  ConflictError,
  HardConstraintCode,
  Coordinate,
  ZoneId,
  PlaceCategory,
  TripPace,
  TimelineSlot,
} from "./types.ts";

export { MOCK_SCHEDULER_INPUT } from "./mock/mock-input.ts";
