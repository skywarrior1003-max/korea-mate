// GoKoreaMate / gokoreamate.com — Near Me 2.0 Public API
// TASK-015: Near Me API Implementation

export { runNearMe } from "./near-me-engine";

export type {
  NearMeInput,
  NearMeResult,
  NearMeResponse,
  NearMePlaceRow,
  ZonedPlace,
} from "./types";

export { ALL_PLACE_CATEGORIES, CATEGORY_MAP, SUPPORTED_DB_CATEGORIES } from "./types";

export { MOCK_NEAR_ME_PLACES } from "./mock/mock-places";
