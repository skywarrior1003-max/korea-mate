// ─────────────────────────────────────────────────────────────────────
//  KoreaMate · User Email (localStorage + Supabase 연동용)
//  비회원 이메일 캡처: email을 localStorage에 임시 저장하고,
//  서버 API(/api/save-email)를 통해 Supabase user_emails 테이블에 연결한다.
// ─────────────────────────────────────────────────────────────────────

const EMAIL_KEY     = "koreamate_user_email";
const EMAIL_SAVED_KEY = "koreamate_email_saved_at";

export function getSavedEmail(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

export function setSavedEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(EMAIL_SAVED_KEY, new Date().toISOString());
  } catch { /* ignore */ }
}

export function clearSavedEmail(): void {
  try {
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(EMAIL_SAVED_KEY);
  } catch { /* ignore */ }
}

export function isEmailSaved(): boolean {
  return !!getSavedEmail();
}

export function getSavedAt(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(EMAIL_SAVED_KEY); } catch { return null; }
}
