"use client";

import { useState, useEffect, useRef } from "react";
import { getSavedEmail, setSavedEmail, isEmailSaved } from "@/lib/userEmail";
import { getDeviceId } from "@/lib/deviceId";

interface Props {
  isOpen:     boolean;
  onClose:    () => void;
  /** 모달을 연 맥락 — CTA 문구에 반영 */
  context?:
    | "save-trip"       // "Save this itinerary"
    | "save-spot"       // "Don't lose your saved spots"
    | "my-trips"        // "Access from any device"
    | "default";
  /** 이메일 저장 성공 후 콜백 */
  onSuccess?: (email: string) => void;
}

const CTA_COPY: Record<NonNullable<Props["context"]>, { headline: string; sub: string; cta: string }> = {
  "save-trip": {
    headline: "Save your Korea itinerary",
    sub:      "Enter your email and reopen this trip anytime — even on a different device.",
    cta:      "Save My Itinerary →",
  },
  "save-spot": {
    headline: "Don't lose your saved ARMY spots",
    sub:      "Save your favorites to your email so you can access them on any device.",
    cta:      "Save My Spots →",
  },
  "my-trips": {
    headline: "Access your trips from anywhere",
    sub:      "Link your email to your device so you never lose a saved itinerary.",
    cta:      "Link My Email →",
  },
  default: {
    headline: "Save your Korea trip",
    sub:      "Enter your email to keep your itinerary and saved spots safe.",
    cta:      "Save →",
  },
};

export default function EmailCaptureModal({ isOpen, onClose, context = "default", onSuccess }: Props) {
  const [email,     setEmail]     = useState("");
  const [status,    setStatus]    = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg,  setErrorMsg]  = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 모달이 열릴 때 기존 이메일 프리필, 포커스
  useEffect(() => {
    if (isOpen) {
      const saved = getSavedEmail();
      if (saved) setEmail(saved);
      setStatus("idle");
      setErrorMsg("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copy = CTA_COPY[context];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/save-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: trimmed, deviceId: getDeviceId() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Error ${res.status}`);
      }

      setSavedEmail(trimmed);
      setStatus("success");
      onSuccess?.(trimmed);
      setTimeout(() => onClose(), 1800);
    } catch (err) {
      setStatus("error");
      setErrorMsg((err as Error).message || "Something went wrong. Please try again.");
    }
  }

  return (
    // 배경 오버레이
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative animate-in fade-in zoom-in-95 duration-200">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg font-bold"
        >
          ✕
        </button>

        {/* 아이콘 + 헤드라인 */}
        <div className="mb-6 text-center">
          <div className="text-5xl mb-3">🇰🇷</div>
          <h2 className="text-xl font-black text-gray-900 leading-snug mb-2">{copy.headline}</h2>
          <p className="text-sm text-gray-500 leading-relaxed">{copy.sub}</p>
        </div>

        {status === "success" ? (
          // 성공 상태
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-base font-black text-gray-900 mb-1">Saved!</p>
            <p className="text-sm text-gray-500">Your trip is now linked to <strong>{email}</strong></p>
          </div>
        ) : (
          // 이메일 입력 폼
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={status === "loading"}
              className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-200 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 transition-colors disabled:opacity-60"
            />
            {errorMsg && (
              <p className="text-xs font-semibold text-red-500 px-1">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              className="w-full py-3.5 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#f97316" }}
            >
              {status === "loading" ? "Saving…" : copy.cta}
            </button>
          </form>
        )}

        {/* 이미 저장된 경우 — 프라이버시 안내 */}
        {!isEmailSaved() && status !== "success" && (
          <p className="mt-4 text-center text-[11px] text-gray-400">
            We only use your email to link your saved trips. No spam, no passwords.
          </p>
        )}

        {/* No thanks 링크 */}
        {status !== "success" && (
          <div className="mt-3 text-center">
            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
            >
              No thanks, I&apos;ll lose it if I clear my browser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
