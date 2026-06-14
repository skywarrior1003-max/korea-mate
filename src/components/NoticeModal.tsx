"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const NOTICE_VERSION = "v2-food-guide-194-2026-06";
const STORAGE_KEY = "km_notice_dismissed";

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NoticeModal() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Check localStorage on mount — same logic as before
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { date, version } = JSON.parse(raw);
        if (date === getTodayString() && version === NOTICE_VERSION) return;
      }
    } catch { /* ignore malformed localStorage */ }
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  const handleDontShowToday = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ date: getTodayString(), version: NOTICE_VERSION })
      );
    } catch { /* ignore storage errors */ }
    setOpen(false);
  }, []);

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC key closes the modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  // Move focus to close button when modal opens
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.50)" }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Orange accent top bar */}
        <div className="h-1.5 w-full shrink-0 rounded-t-2xl" style={{ backgroundColor: "#FF5722" }} />

        {/* X close button — fixed at top-right, always visible above content */}
        <button
          ref={closeRef}
          onClick={handleClose}
          aria-label="Close notice"
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors z-10 text-base leading-none"
        >
          ✕
        </button>

        {/* Scrollable content — body scrolls here, not behind the modal */}
        <div className="overflow-y-auto overscroll-contain px-6 py-5 sm:px-7">
          <h2
            id="notice-modal-title"
            className="text-lg sm:text-xl font-black text-gray-900 mb-4 tracking-tight pr-8"
          >
            Notice from KoreaMate
          </h2>

          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            To ARMY and travelers visiting Busan,
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            We created KoreaMate because we wanted to help you enjoy Busan with
            better food, travel, and map information.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            However, some of our earlier restaurant and map data was not
            accurate enough, and we are sorry that we did not catch and improve
            it sooner.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            We have now rebuilt our Busan Food Guide using the official 2026
            Busan food guide data, and{" "}
            <strong>194 selected restaurants</strong> are currently available on
            KoreaMate.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            Some images, coordinates, and travel route features may still need
            further review, but the restaurant names, categories, addresses, and
            phone numbers have been carefully updated based on the official
            guide.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            We hope this can help make your trip to Busan a little easier,
            smoother, and happier.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            Thank you for your understanding.
            <br />
            We will keep improving KoreaMate step by step.
          </p>
          <p className="text-sm sm:text-base text-gray-500 mt-3 font-medium">
            — KoreaMate
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6 pb-1">
            <button
              onClick={handleDontShowToday}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Don&apos;t show again today
            </button>
            <button
              onClick={handleClose}
              className="flex-1 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#FF5722" }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
