// GoKoreaMate / gokoreamate.com — Events JSON Loader
// TASK-016: Explore & Events API
// Static import — Cloudflare Pages 호환 (fs.readFileSync 미사용)

import rawEventsJson from "../../../public/data/events.json";
import type { RawEvent } from "./types";

export function loadRawEvents(): RawEvent[] {
  return rawEventsJson as unknown as RawEvent[];
}
