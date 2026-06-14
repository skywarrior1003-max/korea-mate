"use client";

import { useState, useEffect } from "react";

const NOTICE_VERSION = "v2-food-guide-194-2026-06";
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
            Notice from KoreaMate
          </h2>

          {/* Body */}
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
            Busan food guide data, and <strong>194 selected restaurants</strong> are
            currently available on KoreaMate.
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
