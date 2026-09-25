// 페이지네이션·신규(60일) 순위 코어 (PAGINATION-AND-NEW-DISCOVERY-V1 §2·§3·§5)
//
// 서버(Worker·RPC)가 전체 적격 집합 기준으로 순위를 확정한 뒤 페이지만 자른다.
// 이 모듈은 그 계약의 순수 로직 — 장소 인기 순위는 DB RPC(071)가 같은 규칙으로
// 계산하고, Story(소규모 집합)와 신규 Story 는 Worker 가 이 코어로 계산한다.
// newScore·baseScore·freshnessBonus·dislike 는 어떤 응답에도 싣지 않는다.

import { communityScore } from "./community-core.ts";

// ── 페이지네이션 계약(§5-2) ─────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 24 as const;
/** public 요청이 어떤 값을 보내도 한 응답은 이 수를 넘지 않는다 */
export const MAX_PAGE_LIMIT = 30 as const;

export function clampPublicLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}

export function clampPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  // 무제한 offset scan 방지 — pool 상한(1000)/최소 limit(1) 기준의 안전 상한
  return Math.min(Math.floor(n), 1000);
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * 전역 순위가 이미 확정된 목록을 페이지로 자른다.
 * rank 는 페이지와 무관한 전역 값 — page 2 의 첫 rank 는 page 1 마지막 + 1.
 */
export function paginateRanked<T>(ranked: T[], page: number, limit: number): Page<T & { rank: number }> {
  const start = (page - 1) * limit;
  const items = ranked.slice(start, start + limit)
    .map((item, i) => ({ ...item, rank: start + i + 1 }));
  return { items, page, limit, total: ranked.length, hasMore: start + limit < ranked.length };
}

// ── 신규(60일) 계약(§2-2·§3) ────────────────────────────────────────────────
export const NEW_WINDOW_DAYS = 60 as const;
export const NEW_POOL_MAX = 1000 as const;
export const FRESHNESS_MAX = 6 as const;

const DAY_MS = 86_400_000;

/** 경과 일수(실수). 미래 시각·음수는 0 으로 clamp */
export function ageDays(nowMs: number, firstAtMs: number): number {
  return Math.max(0, (nowMs - firstAtMs) / DAY_MS);
}

/** clamp(6 × (1 − ageDays/60), 0, 6) — 60일 선형 감소 */
export function freshnessBonus(nowMs: number, firstAtMs: number): number {
  return Math.min(Math.max(FRESHNESS_MAX * (1 - ageDays(nowMs, firstAtMs) / NEW_WINDOW_DAYS), 0), FRESHNESS_MAX);
}

/**
 * 신규 창 판정 — **정확히 60일 경과 시점부터 제외**(엄격 미만 포함).
 * 59일 23:59:59 은 포함, 60×24h 정각은 제외. 미래 시각은 age 0 취급이라 포함.
 */
export function isWithinNewWindow(nowMs: number, firstAtMs: number): boolean {
  return nowMs - firstAtMs < NEW_WINDOW_DAYS * DAY_MS;
}

export interface NewRankInput {
  id: string;
  likes: number;
  dislikes: number;
  usage: number;
  /** 최초 승인·게시 시각(ms). immutable 값에서 파생 */
  firstAtMs: number;
}

/** §3 정렬: newScore → base → usage → like → firstAt 최신 → 안정 ID */
export function compareNewRanked(nowMs: number) {
  return (a: NewRankInput, b: NewRankInput): number => {
    const baseA = communityScore(a), baseB = communityScore(b);
    const newA = baseA + freshnessBonus(nowMs, a.firstAtMs);
    const newB = baseB + freshnessBonus(nowMs, b.firstAtMs);
    if (newB !== newA) return newB - newA;
    if (baseB !== baseA) return baseB - baseA;
    if (b.usage !== a.usage) return b.usage - a.usage;
    if (b.likes !== a.likes) return b.likes - a.likes;
    if (b.firstAtMs !== a.firstAtMs) return b.firstAtMs - a.firstAtMs;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/** 신규 pool: 창 내 후보를 최신 게시순으로 상한 1000 까지만 */
export function newPool<T extends { firstAtMs: number; id: string }>(nowMs: number, all: T[]): T[] {
  return all
    .filter(x => isWithinNewWindow(nowMs, x.firstAtMs))
    .sort((a, b) => (b.firstAtMs - a.firstAtMs) || (a.id < b.id ? -1 : 1))
    .slice(0, NEW_POOL_MAX);
}
