// Cloudflare Pages Functions — 관리자 메일 공통 유틸 (Resend)
//
// 왜 여기로 뺐나
//   Resend 호출부가 contact.ts 안에만 있었다. 신고 알림이 같은 일을 하려면
//   그 코드를 복사해야 했고, 복사한 순간 두 경로가 조금씩 달라진다. 한쪽만
//   고치면 다른 쪽은 조용히 예전 동작으로 남는다. 그래서 하나만 둔다.
//
// 새 provider 를 붙이지 않았다. SDK 도 추가하지 않았다. 기존 env 그대로다.
//   RESEND_API_KEY · ADMIN_NOTIFICATION_EMAIL · CONTACT_FROM_EMAIL(선택)
//
// 계약
// - 재시도 0. 실패하면 실패로 끝난다.
// - 호출한 쪽의 사용자 요청을 깨뜨리지 않는다. 던지지 않고 결과를 돌려준다.
// - provider 응답 원문을 밖으로 내보내지 않는다. 로그에도 상태 코드만 남긴다.
// - 키를 로그·응답 어디에도 넣지 않는다.

export interface AdminEmailEnv {
  RESEND_API_KEY?:           string;
  ADMIN_NOTIFICATION_EMAIL?: string;
  CONTACT_FROM_EMAIL?:       string;
}

export type AdminEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "provider_error" | "network_error"; status?: number };

const DEFAULT_FROM = "gokoreamate <noreply@gokoreamate.com>";

/**
 * 관리자에게 메일 한 통. 재시도하지 않는다.
 *
 * 던지지 않는 이유: 이 함수를 부르는 쪽은 전부 사용자 요청 처리 중이다.
 * 메일이 안 갔다고 사용자의 문의 접수나 신고 접수가 실패하면 안 된다.
 */
export async function sendAdminEmail(
  env: AdminEmailEnv,
  message: { subject: string; text: string },
): Promise<AdminEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  const to     = env.ADMIN_NOTIFICATION_EMAIL;
  const from   = env.CONTACT_FROM_EMAIL ?? DEFAULT_FROM;

  if (!apiKey || !to) {
    console.warn("[admin-email] RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL not set — skipping notification");
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) {
      // 응답 원문을 남기지 않는다. 키가 들어간 요청의 에코가 섞일 수 있다.
      console.error("[admin-email] provider responded with status", res.status);
      return { ok: false, reason: "provider_error", status: res.status };
    }
    return { ok: true };
  } catch {
    console.error("[admin-email] provider request failed");
    return { ok: false, reason: "network_error" };
  }
}
