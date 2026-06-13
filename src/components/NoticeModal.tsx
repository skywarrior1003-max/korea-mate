"use client";

import { useState, useEffect } from "react";

const NOTICE_VERSION = "v1-map-fix-2026-06";
const STORAGE_KEY = "km_notice_dismissed";

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { date, version } = JSON.parse(raw);
        if (date === getTodayString() && version === NOTICE_VERSION) {
          return;
        }
      }
    } catch {
      // ignore malformed localStorage
    }
    setOpen(true);
  }, []);

  if (!open) return null;

  function handleClose() {
    setOpen(false);
  }

  function handleDontShowToday() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ date: getTodayString(), version: NOTICE_VERSION })
      );
    } catch {
      // ignore storage errors
    }
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Orange accent top bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: "#FF5722" }} />

        <div className="px-6 py-6 sm:px-7 sm:py-7">
          {/* Title */}
          <h2 className="text-lg sm:text-xl font-black text-gray-900 mb-4 tracking-tight">
            Notice
          </h2>

          {/* Body */}
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            We are currently checking and improving some restaurant map links
            and address matching on KoreaMate. Some Naver Map and Google Maps
            links may not yet lead to the exact restaurant location.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            We are sorry that we did not catch this issue earlier. We are
            working carefully to improve the data so your Busan trip can be
            smoother, easier, and more reliable.
          </p>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed mt-3">
            Thank you for your understanding. We hope your journey in Busan is
            filled only with happy moments.
          </p>
          <p className="text-sm sm:text-base text-gray-500 mt-3 font-medium">
            — KoreaMate
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
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
