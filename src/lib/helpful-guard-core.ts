// Helpful 서버 가드 — 복사자만 원본 공개 일정에 반응할 수 있도록 검증 (주입식, 테스트용)
//
// Helpful 의 의미를 "복사 후 실제로 써본 사람의 반응"으로 유지하기 위해
// RPC 호출 전에 세 가지를 확인한다:
//   1. 대상 일정이 존재하고 is_public = true
//   2. 요청 device_id 가 원본 소유자가 아님 (셀프 반응 차단)
//   3. 요청 device_id 가 copy_of = 대상 id 인 복사본을 현재 소유
//
// 중복 반응은 기존 RPC(ON CONFLICT DO NOTHING + unique 제약)가 DB 레벨에서 막는다.
// 한계: 계정이 없는 구조라 기기 ID 를 새로 만드는 어뷰징까지는 막지 못한다.
//
// 응답에 원작자 device_id 등 민감정보를 포함하지 않는다.

export type HelpfulReason = "added" | "already_added" | "self" | "not_copied";

export interface StatusResult {
  status: number;
  /** eligible = 이 기기가 지금 반응을 보낼 자격이 있는가 / sent = 이미 보냈는가 */
  body: { eligible?: boolean; sent?: boolean; error?: string };
}

export interface GuardResult {
  status: number;
  body: { added?: boolean; helpful_count?: number; reason?: HelpfulReason; error?: string };
}

interface QueryChain {
  select(fields: string): QueryChain;
  eq(col: string, val: unknown): QueryChain;
  limit(n: number): QueryChain;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
}

export interface HelpfulAdminLike {
  from(table: string): QueryChain;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

// ── 상태 조회 (GET) — 카운트 변경 없음 ────────────────────────────────────────
// PATCH 와 동일한 3중 가드를 재사용해 eligible 을 판정하고, 투표 행 존재로 sent 를
// 판정한다. 민감정보(원작자 device_id, copy_of 등)는 응답에 포함하지 않는다.
export async function helpfulStatus(
  itineraryId: string,
  deviceId: string,
  admin: HelpfulAdminLike,
): Promise<StatusResult> {
  const { data: target, error: targetErr } = (await admin
    .from("itineraries")
    .select("id, device_id, is_public")
    .eq("id", itineraryId)
    .maybeSingle()) as {
    data: { id: string; device_id: string | null; is_public: boolean } | null;
    error: { code?: string } | null;
  };
  if (targetErr) {
    console.error("[helpful GET] db error (target):", targetErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  if (!target || !target.is_public) return { status: 404, body: { error: "Not found" } };

  // 자기 일정이면 자격 없음 (존재 사실만 알려주고 상태는 false)
  if (target.device_id && target.device_id === deviceId) {
    return { status: 200, body: { eligible: false, sent: false } };
  }

  const { data: copy, error: copyErr } = (await admin
    .from("itineraries")
    .select("id")
    .eq("copy_of", itineraryId)
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null };
  if (copyErr) {
    console.error("[helpful GET] db error (copy):", copyErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  if (!copy) return { status: 200, body: { eligible: false, sent: false } };

  const { data: vote, error: voteErr } = (await admin
    .from("itinerary_helpful_votes")
    .select("id")
    .eq("itinerary_id", itineraryId)
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null };
  if (voteErr) {
    console.error("[helpful GET] db error (vote):", voteErr.code);
    return { status: 500, body: { error: "Server error" } };
  }

  return { status: 200, body: { eligible: true, sent: !!vote } };
}

export async function guardedHelpfulVote(
  itineraryId: string,
  deviceId: string,
  admin: HelpfulAdminLike,
): Promise<GuardResult> {
  // ── 1. 대상 존재 + 공개 여부 ────────────────────────────────────────────────
  const { data: target, error: targetErr } = (await admin
    .from("itineraries")
    .select("id, device_id, is_public, helpful_count")
    .eq("id", itineraryId)
    .maybeSingle()) as {
    data: { id: string; device_id: string | null; is_public: boolean; helpful_count: number | null } | null;
    error: { code?: string } | null;
  };
  if (targetErr) {
    console.error("[helpful PATCH] db error (target):", targetErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  // 미존재·비공개 모두 404 — 존재 여부 누출 방지
  if (!target || !target.is_public) return { status: 404, body: { error: "Not found" } };

  // ── 2. 셀프 반응 차단 (카운트 증가 없이 200) ────────────────────────────────
  if (target.device_id && target.device_id === deviceId) {
    return {
      status: 200,
      body: { added: false, reason: "self", helpful_count: target.helpful_count ?? 0 },
    };
  }

  // ── 3. 요청 기기가 이 원본의 복사본을 실제로 소유하는지 ──────────────────────
  const { data: copy, error: copyErr } = (await admin
    .from("itineraries")
    .select("id")
    .eq("copy_of", itineraryId)
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null };
  if (copyErr) {
    console.error("[helpful PATCH] db error (copy):", copyErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  if (!copy) {
    return {
      status: 200,
      body: { added: false, reason: "not_copied", helpful_count: target.helpful_count ?? 0 },
    };
  }

  // ── 4. 기존 RPC 호출 — 중복은 unique 제약 + ON CONFLICT 가 처리 ─────────────
  const { data, error } = await admin.rpc("add_itinerary_helpful_vote", {
    p_itinerary_id: itineraryId,
    p_device_id:    deviceId,
  });
  if (error) {
    console.error("[helpful PATCH] rpc error:", (error as { code?: string }).code);
    return { status: 500, body: { error: "Failed to record vote" } };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { added?: boolean; helpful_count?: number } | null;
  const added = row?.added ?? false;
  return {
    status: 200,
    body: {
      added,
      helpful_count: row?.helpful_count ?? 0,
      reason: added ? "added" : "already_added",
    },
  };
}
