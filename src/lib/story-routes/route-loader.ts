// GoKoreaMate / gokoreamate.com — Route Templates JSON Loader
// TASK-019: Story Routes API + Legacy Cleanup
// Static import — Cloudflare Pages 호환 (fs.readFileSync 미사용)

import rawRouteTemplatesJson from "../../../public/data/route_templates.json";
import type { RouteTemplate } from "./types";

export function loadRouteTemplates(): RouteTemplate[] {
  return rawRouteTemplatesJson as unknown as RouteTemplate[];
}

export function findRouteById(routeId: string): RouteTemplate | undefined {
  return loadRouteTemplates().find(r => r.route_id === routeId && r.is_active);
}

export function findRoutesByCity(city: string): RouteTemplate[] {
  return loadRouteTemplates().filter(r => r.city === city && r.is_active);
}
