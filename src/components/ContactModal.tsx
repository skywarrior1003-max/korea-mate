"use client";

import { useState, useEffect, useRef } from "react";

const INQUIRY_TYPES = [
  "General question",
  "Wrong restaurant information",
  "Wrong map location",
  "Closed or moved place",
  "Suggest a place",
  "Partnership / business inquiry",
  "Other",
] as const;

export type ContactModalProps = {
  open: boolean;
  onClose: () => void;
  relatedPlaceId?: string;
  relatedPlaceName?: string;
};

type SubmitStatus = "idle" | "loading" | "success" | "error";

export default function ContactModal({
  open,
  onClose,
  relatedPlaceId,
  relatedPlaceName,
}: ContactModalProps) {
  const [type,    setType]    = useState<string>(INQUIRY_TYPES[0]);
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [message, setMessage] = useState("");
  const [hp,      setHp]      = useState(""); // honeypot
  const [status,  setStatus]  = useState<SubmitStatus>("idle");
  const [errMsg,  setErrMsg]  = useState("");
  const firstRef = useRef<HTMLSelectElement>(null);

  // Focus first field when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => firstRef.current?.focus(), 60);
    } else {
      // Reset on close (after animation)
      setTimeout(() => {
        setType(INQUIRY_TYPES[0]);
        setName("");
        setEmail("");
        setMessage("");
        setHp("");
        setStatus("idle");
        setErrMsg("");
      }, 200);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;

    // Client-side validation
    if (!email.trim()) { setErrMsg("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrMsg("Please enter a valid email address.");
      return;
    }
    if (message.trim().length < 10) {
      setErrMsg("Message must be at least 10 characters.");
      return;
    }
    if (message.trim().length > 3000) {
      setErrMsg("Message is too long (max 3000 characters).");
      return;
    }

    setStatus("loading");
    setErrMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name:              name.trim()    || undefined,
          email:             email.trim(),
          message:           message.trim(),
          relatedPageUrl:    typeof window !== "undefined" ? window.location.href : undefined,
          relatedPlaceId:    relatedPlaceId    || undefined,
          relatedPlaceName:  relatedPlaceName  || undefined,
          _hp: hp, // honeypot
        }),
      });

      const data = await res.json() as { success?: boolean; error?: string };

      if (res.ok && data.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrMsg(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrMsg("Network error. Please check your connection and try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: "#f97316" }} />

        <div className="px-6 pt-5 pb-1 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-900 tracking-tight">
              Contact GoKoreaMate
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 pb-6 pt-2 flex-1">
          {status === "success" ? (
            <div className="py-10 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-base font-black text-gray-900 mb-2">Message sent!</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Thank you for reaching out. We&apos;ll review your message and get back
                to you if needed.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#f97316" }}
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4 mt-1">
              {/* Honeypot — hidden from real users */}
              <input
                type="text"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ display: "none" }}
              />

              {/* Inquiry type */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Inquiry type <span className="text-orange-500">*</span>
                </label>
                <select
                  ref={firstRef}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                >
                  {INQUIRY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Name or nickname <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. ARMY Busan fan"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Email <span className="text-orange-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              {/* Related place (if provided) */}
              {relatedPlaceName && (
                <div className="px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-700 font-medium">
                  📍 Related place: <strong>{relatedPlaceName}</strong>
                </div>
              )}

              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Message <span className="text-orange-500">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={3000}
                  placeholder="Please describe your question or feedback in detail (min 10 characters)..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
                />
                <p className="text-right text-[10px] text-gray-400 mt-0.5">
                  {message.length}/3000
                </p>
              </div>

              {/* Error */}
              {errMsg && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 font-medium">
                  {errMsg}
                </div>
              )}

              {/* Privacy note */}
              <p className="text-[11px] text-gray-400 leading-relaxed">
                By submitting this form, your message and email address will be stored
                so we can review and respond to your inquiry.
              </p>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="flex-1 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: "#f97316" }}
                >
                  {status === "loading" ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
