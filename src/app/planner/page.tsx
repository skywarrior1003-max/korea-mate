"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import TimelineView from "@/components/TimelineView";
import DatePicker from "@/components/DatePicker";
import EventDetailModal from "@/components/EventDetailModal";
import {
  getCart,
  CART_EVENT,
  type CartItem,
  type EventItem,
} from "@/lib/cart";
import { PLANNER_EVENT } from "@/lib/plannerStore";
import { upsertPlannerSession, fetchPlannerSession } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

// ── 유틸 ────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── 타입 ────────────────────────────────────────
interface TripDay {
  label:       string;
  date:        string;
  arrivalTime: string;
}

type ScheduledMap = Record<number, CartItem[]>;

const PLANNER_SB_ID_KEY = "koreamate_planner_sb_id";

// ══════════════════════════════════════════════════════════════
//  실제 플래너 컨텐츠 (useSearchParams 사용 → Suspense 필요)
// ══════════════════════════════════════════════════════════════
function PlannerContent() {
  const searchParams = useSearchParams();
  const shareId = searchParams.get("id");

  // ── 장바구니 / 여행 설정 상태 ─────────────────
  const [cartItems,    setCartItems]    = useState<CartItem[]>([]);
  const [numDays,      setNumDays]      = useState(3);
  const [startDate,    setStartDate]    = useState("");
  const [arrivalTimes, setArrivalTimes] = useState<string[]>(
    Array.from({ length: 14 }, (_, i) => (i === 0 ? "14:00" : "09:00"))
  );
  const [scheduled,    setScheduled]    = useState<ScheduledMap>({});
  const [activeDay,    setActiveDay]    = useState(0);
  const [dragOver,     setDragOver]     = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  // ── Supabase 동기화 상태 ──────────────────────
  const [plannerSbId,     setPlannerSbId]     = useState<string | null>(null);
  const [syncStatus,      setSyncStatus]      = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied,          setCopied]          = useState(false);
  const [isShareView,     setIsShareView]     = useState(false);
  const syncTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // autoSave 스킵 카운터
  const skipSaveRef = useRef(0);

  // ── 장바구니 동기화 ───────────────────────────
  const refreshCart = useCallback(() => setCartItems(getCart()), []);
  useEffect(() => {
    refreshCart();
    window.addEventListener(CART_EVENT, refreshCart);
    return () => window.removeEventListener(CART_EVENT, refreshCart);
  }, [refreshCart]);

  // ── 공유 링크 로드 (?id=UUID) ─────────────────
  useEffect(() => {
    if (!shareId) return;
    setIsShareView(true);
    setPlannerSbId(shareId);
    fetchPlannerSession(shareId).then(record => {
      if (!record) return;
      skipSaveRef.current = 1;
      setNumDays(record.num_days ?? 3);
      setStartDate(record.start_date ?? "");
      setArrivalTimes(
        record.arrival_times ?? Array.from({ length: 14 }, (_, i) => (i === 0 ? "14:00" : "09:00"))
      );
      setScheduled((record.scheduled as ScheduledMap) ?? {});
      setSyncStatus("saved");
    });
  }, [shareId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UUID 초기화 + Supabase 우선 복원 (일반 모드, 마운트 1회) ─
  useEffect(() => {
    if (shareId) return;

    // 낡은 v1 캐시 일회성 철거
    try { localStorage.removeItem("koreamate_planner_v1"); } catch {}

    let id: string | null = null;
    try { id = localStorage.getItem(PLANNER_SB_ID_KEY); } catch {}
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(PLANNER_SB_ID_KEY, id); } catch {}
    }
    setPlannerSbId(id);

    // Supabase에서 플래너 복원 (AI 일정 포함 전체 데이터)
    fetchPlannerSession(id).then(record => {
      if (!record) return;
      skipSaveRef.current = 1;
      setNumDays(record.num_days ?? 3);
      setStartDate(record.start_date ?? "");
      setArrivalTimes(
        record.arrival_times ?? Array.from({ length: 14 }, (_, i) => (i === 0 ? "14:00" : "09:00"))
      );
      setScheduled((record.scheduled as ScheduledMap) ?? {});
      setSyncStatus("saved");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto-save: 변경마다 Supabase 동기화 (localStorage 캐시 제거) ──
  useEffect(() => {
    if (skipSaveRef.current > 0) { skipSaveRef.current--; return; }

    // 경량 메타(numDays, startDate)만 localStorage에 유지 → itinerary 뱃지용
    if (!isShareView) {
      try {
        localStorage.setItem("koreamate_planner_meta", JSON.stringify({ numDays, startDate }));
        window.dispatchEvent(new CustomEvent(PLANNER_EVENT));
      } catch { /* ignore */ }
    }

    // Supabase 디바운스 동기화 (1.5s)
    if (!plannerSbId || isShareView) return;
    setSyncStatus("saving");
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    const snapId           = plannerSbId;
    const snapNumDays      = numDays;
    const snapStartDate    = startDate;
    const snapArrivalTimes = arrivalTimes;
    const snapScheduled    = scheduled;

    syncTimerRef.current = setTimeout(async () => {
      const ok = await upsertPlannerSession({
        id:            snapId,
        num_days:      snapNumDays,
        start_date:    snapStartDate,
        arrival_times: snapArrivalTimes,
        scheduled:     snapScheduled,
        device_id:     getDeviceId(),
      });
      setSyncStatus(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSyncStatus("idle"), 3000);
    }, 1500);
  }, [scheduled, startDate, numDays, arrivalTimes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 공유 링크 복사 ───────────────────────────
  async function handleCopyShareLink() {
    if (!plannerSbId) return;
    const url = `${window.location.origin}/planner?id=${plannerSbId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── 계산값 ────────────────────────────────────
  const tripDays = useMemo<TripDay[]>(
    () => Array.from({ length: numDays }, (_, i) => ({
      label:       `Day ${i + 1}`,
      date:        addDays(startDate, i),
      arrivalTime: arrivalTimes[i] ?? "09:00",
    })),
    [numDays, startDate, arrivalTimes]
  );

  const scheduledIds = useMemo(
    () => new Set(Object.values(scheduled).flat().map((x) => x.id)),
    [scheduled]
  );

  const unscheduled = useMemo(
    () => cartItems.filter((x) => !scheduledIds.has(x.id)),
    [cartItems, scheduledIds]
  );

  const todayItems = useMemo(
    () => scheduled[activeDay] ?? [],
    [scheduled, activeDay]
  );

  const todayMins = useMemo(
    () => todayItems.reduce((s, x) => s + x.recommendedDurationMinutes + 20, 0) - (todayItems.length > 0 ? 20 : 0),
    [todayItems]
  );

  // ── 이벤트 핸들러 ────────────────────────────
  function handleUnscheduledClick(item: CartItem, isMobile: boolean) {
    if (isMobile) {
      setScheduled((prev) => {
        const target = prev[activeDay] ?? [];
        if (target.some((x) => x.id === item.id)) return prev;
        return { ...prev, [activeDay]: [...target, item] };
      });
    } else {
      setSelectedEvent(item as unknown as EventItem);
    }
  }

  function handleDragStart(e: React.DragEvent, item: CartItem) {
    e.dataTransfer.setData("itemId", item.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDropOnDay(e: React.DragEvent, dayIdx: number) {
    e.preventDefault();
    setDragOver(null);
    const id   = e.dataTransfer.getData("itemId");
    const item = cartItems.find((x) => x.id === id);
    if (!item) return;

    setScheduled((prev) => {
      const next: ScheduledMap = {};
      for (const k in prev) {
        next[Number(k)] = prev[Number(k)].filter((x) => x.id !== id);
      }
      const target = next[dayIdx] ?? [];
      if (target.some((x) => x.id === id)) return next;
      next[dayIdx] = [...target, item];
      return next;
    });
  }

  function handleUnschedule(id: string) {
    setScheduled((prev) => {
      const next: ScheduledMap = {};
      for (const k in prev) {
        next[Number(k)] = prev[Number(k)].filter((x) => x.id !== id);
      }
      return next;
    });
  }

  function handleMoveUp(id: string, dayIdx: number) {
    setScheduled((prev) => {
      const arr = [...(prev[dayIdx] ?? [])];
      const i   = arr.findIndex((x) => x.id === id);
      if (i <= 0) return prev;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      return { ...prev, [dayIdx]: arr };
    });
  }

  function handleMoveDown(id: string, dayIdx: number) {
    setScheduled((prev) => {
      const arr = [...(prev[dayIdx] ?? [])];
      const i   = arr.findIndex((x) => x.id === id);
      if (i < 0 || i >= arr.length - 1) return prev;
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      return { ...prev, [dayIdx]: arr };
    });
  }

  function setArrivalTime(idx: number, val: string) {
    setArrivalTimes((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  // ── 빈 장바구니 화면 (공유 뷰에서는 카트 없어도 일정 표시) ─
  const hasAnything = cartItems.length > 0 || Object.values(scheduled).some(arr => arr.length > 0);
  if (!hasAnything) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gray-50">
        <p className="text-5xl">🗺️</p>
        <h1 className="text-2xl font-black text-gray-900">Your itinerary is empty</h1>
        <p className="text-sm text-gray-500 text-center max-w-xs">
          Add events and spots from the main page first, then come back here to build your timeline.
        </p>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#f97316" }}
        >
          ← Explore Events
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── 헤더 ── */}
      <header
        className="sticky top-0 z-30 h-14 flex items-center justify-between px-5 shadow-sm"
        style={{ backgroundColor: "#1a1f36" }}
      >
        <Link href="/" className="text-base font-black text-white flex items-center gap-1.5">
          <span>🇰🇷</span>
          Korea<span style={{ color: "#f97316" }}>Mate</span>
        </Link>

        <h1 className="text-sm font-black text-white">
          {isShareView ? "Shared Planner" : "My Planner"}
        </h1>

        <div className="flex items-center gap-3">
          {/* 동기화 상태 */}
          {!isShareView && syncStatus === "saving" && (
            <span className="text-[10px] font-bold text-yellow-300 animate-pulse">⟳ Saving…</span>
          )}
          {!isShareView && syncStatus === "saved" && (
            <span className="text-[10px] font-bold text-emerald-400">☁️ Saved</span>
          )}
          {!isShareView && syncStatus === "error" && (
            <span className="text-[10px] font-bold text-red-400">⚠️ Offline</span>
          )}

          {/* 공유 링크 버튼 */}
          {!isShareView && (
            <button
              onClick={handleCopyShareLink}
              disabled={!plannerSbId}
              className="text-xs font-bold text-white/70 hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-40 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
            >
              {copied ? "✅ Copied!" : "🔗 Share"}
            </button>
          )}

          <Link href="/" className="text-xs font-semibold text-white/60 hover:text-white transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      {/* 공유 뷰 안내 배너 */}
      {isShareView && (
        <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 flex items-center gap-3">
          <span className="text-base">🔗</span>
          <p className="text-xs font-bold text-blue-700">
            You&apos;re viewing a shared planner. Your own planner data is not affected.
          </p>
        </div>
      )}

      {/* ── 바디 ── */}
      <div className="flex flex-col lg:flex-row flex-1 max-w-7xl mx-auto w-full gap-0 lg:gap-6 p-4 lg:p-6">

        {/* ── 왼쪽 패널 ── */}
        <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-4">

          {/* Trip Setup */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
              ✈️ Trip Setup
            </h2>

            <div className="block mb-3">
              <span className="text-xs font-bold text-gray-500 block mb-1">Start Date (optional)</span>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Pick a start date"
              />
            </div>

            <label className="block mb-4">
              <span className="text-xs font-bold text-gray-500 block mb-1">
                Number of Days: <strong className="text-gray-900">{numDays}</strong>
              </span>
              <input
                type="range"
                min={1}
                max={14}
                value={numDays}
                onChange={(e) => setNumDays(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>1 day</span><span>14 days</span>
              </div>
            </label>

            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-500">Arrival Time per Day</span>
              {tripDays.map((day, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 w-12 shrink-0">
                    {day.label}
                    {day.date ? (
                      <span className="block text-[10px] font-normal text-gray-400">{day.date}</span>
                    ) : null}
                  </span>
                  <input
                    type="time"
                    value={arrivalTimes[i] ?? "09:00"}
                    onChange={(e) => setArrivalTime(i, e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 미배치 이벤트 풀 */}
          {!isShareView && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-black text-gray-900 mb-1 flex items-center gap-2">
                📦 Unscheduled
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                  {unscheduled.length}
                </span>
              </h2>
              <p className="text-[10px] text-gray-400 mb-3">
                Drag items onto a day to schedule them
              </p>

              {unscheduled.length === 0 ? (
                <p className="text-xs text-emerald-600 font-semibold text-center py-4">
                  ✅ All events scheduled!
                </p>
              ) : (
                <ul className="space-y-2">
                  {unscheduled.map((item) => (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow group"
                    >
                      <div
                        className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-200 cursor-pointer"
                        onClick={() => setSelectedEvent(item as unknown as EventItem)}
                      >
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.shortName}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/images/placeholder-spot.svg";
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src="/images/placeholder-spot.svg" alt="" className="w-full h-full object-cover" />
                        )}
                      </div>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setSelectedEvent(item as unknown as EventItem)}
                      >
                        <p className="text-xs font-bold text-gray-900 truncate">{item.shortName}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {item.stage} · {item.recommendedDurationMinutes}min
                        </p>
                      </div>

                      <button
                        onClick={() => handleUnscheduledClick(item, true)}
                        title={`Add to Day ${activeDay + 1}`}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-white text-xs font-black transition-colors hover:opacity-80 sm:hidden"
                        style={{ backgroundColor: "#f97316" }}
                      >+</button>

                      <span className="hidden sm:inline text-gray-300 text-base group-hover:text-gray-500 transition-colors">⠿</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        {/* ── 오른쪽 패널 ── */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Day 탭 */}
          <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-1.5 overflow-x-auto">
            {tripDays.map((day, i) => {
              const dayItemCount = (scheduled[i] ?? []).length;
              return (
                <button
                  key={i}
                  onClick={() => setActiveDay(i)}
                  className={`
                    shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all
                    ${activeDay === i ? "text-white shadow-md" : "text-gray-500 hover:bg-gray-50"}
                  `}
                  style={activeDay === i ? { backgroundColor: "#1a1f36" } : {}}
                >
                  <span>{day.label}</span>
                  {day.date && (
                    <span className={`text-[10px] font-normal mt-0.5 ${activeDay === i ? "text-white/60" : "text-gray-400"}`}>
                      {day.date}
                    </span>
                  )}
                  {dayItemCount > 0 && (
                    <span
                      className="mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-black"
                      style={
                        activeDay === i
                          ? { backgroundColor: "#f97316", color: "#fff" }
                          : { backgroundColor: "#f3f4f6", color: "#374151" }
                      }
                    >
                      {dayItemCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 현재 날 요약 바 */}
          {todayItems.length > 0 && (
            <div
              className="flex items-center justify-between px-5 py-3 rounded-2xl text-sm"
              style={{ backgroundColor: "#1a1f36" }}
            >
              <div className="flex items-center gap-3 text-white">
                <span className="font-black">{tripDays[activeDay]?.label}</span>
                <span className="text-white/50">·</span>
                <span className="text-white/80">{todayItems.length} stops</span>
                <span className="text-white/50">·</span>
                <span className="text-white/80">{fmtDuration(todayMins)} total</span>
              </div>
              <span className="text-white/60 text-xs">
                Starts {tripDays[activeDay]?.arrivalTime}
              </span>
            </div>
          )}

          {/* TimelineView */}
          <div className="bg-white rounded-2xl shadow-sm p-5 flex-1">
            <TimelineView
              items={scheduled[activeDay] ?? []}
              arrivalTime={tripDays[activeDay]?.arrivalTime ?? "09:00"}
              date={tripDays[activeDay]?.date ?? ""}
              onRemoveItem={handleUnschedule}
              onMoveUp={(id) => handleMoveUp(id, activeDay)}
              onMoveDown={(id) => handleMoveDown(id, activeDay)}
              isDragOver={dragOver === activeDay}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(activeDay);
              }}
              onDrop={(e) => handleDropOnDay(e, activeDay)}
            />
          </div>

          <div className="h-20" />
        </main>
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  페이지 진입점 — Suspense 래퍼
// ══════════════════════════════════════════════════════════════
export default function PlannerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-500" />
          <p className="text-sm font-bold text-gray-500">Loading planner…</p>
        </div>
      }
    >
      <PlannerContent />
    </Suspense>
  );
}
