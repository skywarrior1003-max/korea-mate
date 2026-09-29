// POST /api/account/delete — 계정 영구 삭제 실행 (ACCOUNT-DELETE-V1 §2)
//
// 인증: 유효 세션(requireUser — GoTrue 서버 검증) + delete-intent 토큰(같은 계정·
// TTL 10분·HMAC). ownership(linked mapping) 을 조건으로 삼지 않는 이유:
// 중간 실패 후 재시도 시 mapping 이 이미 지워져 있어도 나머지 단계를 끝낼 수
// 있어야 한다(성공 위장 금지 — auth 사용자까지 지워져야 200).
//
// 삭제 순서(각 단계 멱등 — 같은 요청을 다시 보내도 남은 것만 지운다):
//   ① 여행: 계정의 linked 기기들이 소유한 itineraries 전부 —
//      단건 삭제와 동일한 cascade(purgeItineraryCascade: Storage-first →
//      반응/스토리 제출 → moments → 행). 타인이 만든 복사본은 018 FK 가
//      copy_of=NULL 로만 만들고 행은 남긴다(유지 계약).
//   ② 내 장소(user_spots): 사진 Storage 제거 후 행 삭제.
//   ③ 저장(place_saves)·반응(content_likes/dislikes·place_likes): 키가 "기기×대상"
//      해시라 역산이 안 된다 — 행을 페이지로 읽어 각 대상에 대해 계정 기기들의
//      키를 재계산해 매칭 삭제한다(서버 내부·원문 미노출). place_likes 의
//      liker_key 는 likerKey() 로 만들며 입력 형식이 actorKey("like") 와 같다.
//   ③-b 기기 ID 원문·기기 파생 키로 남는 흔적(DELETION-COVERAGE-V1):
//      itinerary_helpful_votes·spot_reactions(device_id 원문 — 소문자/대문자 두
//      형태 매칭), itinerary_view_dedup(viewer_hash = sha256(소문자 기기 ID)),
//      mytrip_ai_generations(owner_hash = ownerHashHmac(기기 ID)). 여행에 매인
//      기록은 ① cascade 가 먼저 지운다 — 여기선 남의 여행에 남긴 흔적과 여행 밖 기록.
//   ④ 장소 제보(place_suggestions): suggester_key 는 "기기×도시" 축 —
//      계정 기기×5도시 키로 삭제. 이미 발행된 제보(publications FK)는 커뮤니티
//      자산과의 연결이 있어 개인 텍스트만 삭제 대상이며, FK 로 막히면 해당
//      행만 남기고 계속한다(보고에 잔존 수 포함).
//   ⑤ This Trip 서버 draft(trip_drafts): user 축 + 계정 기기들의 device 축.
//   ⑥ 기기 연결(account_devices): RESTRICT 의 이유가 이 순서다 — 콘텐츠를
//      먼저 지운 뒤 mapping, 마지막에 auth 사용자.
//   ⑦ auth 사용자 삭제(user_consents 는 FK CASCADE). 이 단계까지 끝나야 200.
//
// 유지(삭제하지 않음 — 계약):
//   · place_usage / share_events — 대상·연도 축 익명 집계(개인 식별 불가).
//   · itineraries.helpful_count 집계 수치 — 투표 행은 지우고 수치는 익명 집계로 남긴다.
//   · 타인 계정의 모든 데이터, 타인이 만든 독립 복사본.
//   · 계정 밖에서 따로 정해지는 보존(Owner 결정 사항): place_reports(신고·모더레이션),
//     contact_inquiries(문의 — 계정과 연결 없음), ai_ops_ledger(비용 원장·actor_hash).

import { requireUser } from "../../_lib/user-auth";
import { verifyDeleteIntent, verifiedSessionClaims } from "./delete-intent";
import { purgeAccount } from "../../_lib/account-purge";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MYTRIP_HASH_SECRET?: string;
}
type Ctx = { request: Request; env: Env };

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const env = ctx.env;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.MYTRIP_HASH_SECRET)
    return json({ error: "server_error" }, 500);

  const auth = await requireUser(env as never, ctx.request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let body: { intent?: unknown };
  try { body = JSON.parse(await ctx.request.text()); } catch { return json({ error: "invalid_intent" }, 400); }
  // 재인증한 **그 세션**만 실행할 수 있다 — intent 의 session_id 와 현재 토큰의
  // session_id 가 일치해야 한다(REAUTH-V1 세션 결속).
  const sess = verifiedSessionClaims(ctx.request);
  if (!sess) return json({ error: "invalid_intent" }, 403);
  const okIntent = await verifyDeleteIntent(env.MYTRIP_HASH_SECRET, String(body.intent ?? ""), userId, sess.sid);
  if (!okIntent) return json({ error: "invalid_intent" }, 403);

  return purgeAccount(env, userId);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}
