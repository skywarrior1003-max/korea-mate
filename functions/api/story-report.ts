// Cloudflare Pages Function: POST /api/story-report
//
// 공개 Story 를 신고한다.
//
// 왜 자리를 나눴나
//   `/api/place-report` 는 공개 장소 카탈로그의 정보 오류를 받는 곳이라
//   `city_spots` 에서 대상을 확인하고, 임계치 알림까지 이어진다. Story 는
//   대상 확인 방법도(공개된 여행인가) 사유도 다르다. 같은 함수에 분기를
//   덧대면 두 흐름이 서로를 망가뜨리기 쉬워 자리만 나눴다 —
//   **저장은 같은 테이블**(`place_reports`)이라 관리자는 한 곳만 보면 된다.
//
// 신고는 숨김이 아니다
//   여기서 하는 일은 접수뿐이다. 아무것도 가려지지 않는다. 몇 건이 쌓이면
//   자동으로 가리는 규칙도 없다 — 그건 여러 사람이 몰려와 남의 여행을 내릴 수
//   있게 만드는 것이다. 가릴지는 관리자가 보고 정한다.
//
// SECURITY CONTRACT:
// - 로그인 없이 신고할 수 있다. 공개 Story 를 보는 사람이 곧 신고할 사람이다
// - 신고자 식별은 기존 방식 그대로 — sha256(device_id | target) 만 저장하고
//   raw device_id 는 저장하지 않는다
// - 대상은 공유 링크에 이미 있는 여행 id 하나뿐. Memory·사진 내부 id 를 받지 않는다
// - 비공개·미존재·이미 가려진 대상은 **같은 응답**으로 끝낸다(존재 여부 누출 방지)
// - service_role 키는 서버에만 있고 응답·오류에 담기지 않는다

import {
  parseStoryReport, STORY_TARGET_TYPE,
} from "../../src/lib/moderation/story-moderation-core";
import { isPubliclyVisible } from "../../src/lib/moderation/story-moderation-core";
import { reporterKey } from "../../src/lib/reports/place-report-core";
import { readBodyWithLimit, MAX_SMALL_BODY_BYTES, UUID_RE } from "../../src/lib/itinerary-validate";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface Ctx {
  request: Request;
  env:     Env;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * 접수했다는 응답 하나로 끝낸다.
 *
 * 대상이 비공개든, 없든, 이미 가려졌든 같은 말을 돌려준다. 구분해 주면
 * "이 링크가 존재하는가" 를 밖에서 확인하는 수단이 된다. 신고한 사람에게는
 * 어느 쪽이든 "접수됐다" 로 충분하다.
 */
const accepted = () => json({ accepted: true }, 202);

async function rest(env: Env, method: string, pathQ: string, body?: unknown, prefer?: string) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const res = await fetch(`${url}/rest/v1/${pathQ}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* 본문 없는 응답 */ }
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const env = ctx.env;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server configuration error" }, 503);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);

  const parsed = parseStoryReport(read.body);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  // 신고자 구분용. 없어도 접수는 받는다 — 로그인 없는 방문자가 신고 주체다.
  const raw = (read.body as Record<string, unknown>).device_id;
  const deviceId = typeof raw === "string" && UUID_RE.test(raw) ? raw : "anonymous";

  // 대상이 지금 실제로 공개된 Story 인가. 아니면 조용히 끝낸다.
  const found = await rest(
    env, "GET",
    `itineraries?id=eq.${encodeURIComponent(parsed.targetKey)}` +
    `&select=id,is_public,moderation_hidden_at&limit=1`,
  );
  const row = Array.isArray(found.data) ? found.data[0] as
    { is_public: boolean | null; moderation_hidden_at: string | null } | undefined : undefined;
  if (!row || !isPubliclyVisible(row)) return accepted();

  const rkey = await reporterKey(deviceId, STORY_TARGET_TYPE, parsed.targetKey);

  // 같은 사람이 같은 Story 를 같은 이유로 하루에 여러 번 넣지 않게 한다.
  // 기존 장소 신고와 같은 방식이다 — 영구 unique 를 걸지는 않는다.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const dup = await rest(
    env, "GET",
    `place_reports?reporter_key=eq.${rkey}&target_type=eq.${STORY_TARGET_TYPE}` +
    `&target_key=eq.${encodeURIComponent(parsed.targetKey)}&category=eq.${parsed.category}` +
    `&created_at=gte.${since}&select=id&limit=1`,
  );
  if (Array.isArray(dup.data) && dup.data.length > 0) return accepted();

  const ins = await rest(env, "POST", "place_reports", {
    target_type:  STORY_TARGET_TYPE,
    target_key:   parsed.targetKey,
    category:     parsed.category,
    note:         parsed.note,
    reporter_key: rkey,
  }, "return=minimal");

  if (!ins.ok) {
    // 내부 사정을 신고한 사람에게 옮기지 않는다. 로그에도 대상 id 만 남긴다.
    console.error("[story-report] insert failed:", ins.status);
    return json({ error: "Could not submit the report. Please try again." }, 500);
  }

  return accepted();
}
