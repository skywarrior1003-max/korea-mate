"use client";

import { useState, useEffect, useMemo } from "react";
import {
  apiGetUserSpots,
  apiCreateUserSpot,
  apiUpdateUserSpot,
  apiDeleteUserSpot,
  type UserSpot,
  type UpdateUserSpotInput,
} from "@/lib/user-spots-api";

// ── Local helpers ─────────────────────────────────────────────────────────────

function assignSlot(time: string): string {
  const h = parseInt(time?.split(":")?.[0] ?? "12", 10);
  if (isNaN(h) || h < 12) return "morning";
  if (h < 14)              return "lunch";
  if (h < 17)              return "afternoon";
  return "evening";
}

function calcDefaultTime(places: { time?: string }[]): string {
  if (places.length === 0) return "10:00";
  const last = places[places.length - 1];
  const raw  = last?.time ?? "";
  const [hStr, mStr] = raw.split(":");
  const h = parseInt(hStr ?? "", 10);
  const m = parseInt(mStr ?? "", 10);
  if (isNaN(h) || isNaN(m)) return "10:00";
  const total = h * 60 + m + 90;
  if (total >= 24 * 60) return "20:00";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "attraction",     label: "Attraction"     },
  { value: "nature",         label: "Nature"         },
  { value: "restaurant",     label: "Restaurant"     },
  { value: "event",          label: "Event"          },
  { value: "accommodation",  label: "Accommodation"  },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

// ── Minimal place reference (structural subset of itinerary/page.tsx Place) ──

interface PlaceRef {
  source?:   string;
  place_id?: string;
  time?:     string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  city:             string;
  selectedDayIndex: number;
  selectedDayLabel: string;
  existingPlaces:   PlaceRef[];
  onAddToDay:       (userSpot: UserSpot, selectedTime: string, slot: string) => void;
}

// ── FormState ─────────────────────────────────────────────────────────────────

interface FormState {
  name:     string;
  category: CategoryValue;
  address:  string;
  note:     string;
}

const EMPTY_FORM: FormState = { name: "", category: "attraction", address: "", note: "" };

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserSpotsPanel({
  city,
  selectedDayIndex,
  selectedDayLabel,
  existingPlaces,
  onAddToDay,
}: Props) {
  const [spots,           setSpots]           = useState<UserSpot[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [loadError,       setLoadError]       = useState(false);
  const [showCreate,      setShowCreate]      = useState(false);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);
  const [addingId,        setAddingId]        = useState<string | null>(null);
  const [addErrors,       setAddErrors]       = useState<Record<string, string>>({});
  const [formError,       setFormError]       = useState<string | null>(null);
  const [form,            setForm]            = useState<FormState>(EMPTY_FORM);
  // Per-spot selected times
  const [timeMap, setTimeMap] = useState<Record<string, string>>({});

  // Recalculate default time whenever the selected day or its places change
  const defaultTime = useMemo(
    () => calcDefaultTime(existingPlaces),
    [existingPlaces],
  );

  // Reset per-spot times when the selected day changes
  useEffect(() => {
    setTimeMap({});
    setAddErrors({});
  }, [selectedDayIndex]);

  // Ensure newly loaded spots have a default time in the map
  useEffect(() => {
    setTimeMap(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of spots) {
        if (!(s.id in next)) { next[s.id] = defaultTime; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [spots, defaultTime]);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadSpots() {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiGetUserSpots();
      setSpots(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSpots(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create ────────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId(null);
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError("Name is required."); return; }
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await apiCreateUserSpot({
        name,
        category: form.category,
        city:     city || undefined,
        address:  form.address.trim() || undefined,
        note:     form.note.trim()    || undefined,
      });
      setSpots(prev => [{
        id:         created.id,
        name,
        category:   form.category,
        city:       city || undefined,
        address:    form.address.trim() || undefined,
        note:       form.note.trim()    || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch {
      setFormError("Could not save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function openEdit(spot: UserSpot) {
    setForm({
      name:     spot.name,
      category: (spot.category as CategoryValue) || "attraction",
      address:  spot.address ?? "",
      note:     spot.note    ?? "",
    });
    setFormError(null);
    setShowCreate(false);
    setConfirmDeleteId(null);
    setEditingId(spot.id);
  }

  async function handleEdit(e: React.FormEvent, spot: UserSpot) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError("Name is required."); return; }
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const input: UpdateUserSpotInput = {
        name,
        category: form.category,
        // Empty string → null (clear DB value), value → update
        address: form.address.trim() || null,
        note:    form.note.trim()    || null,
      };
      const ok = await apiUpdateUserSpot(spot.id, input);
      if (!ok) { setFormError("Place not found."); return; }
      setSpots(prev => prev.map(s => s.id !== spot.id ? s : {
        ...s,
        name:     input.name,
        category: input.category,
        address:  input.address  === null ? undefined : (input.address ?? s.address),
        note:     input.note     === null ? undefined : (input.note    ?? s.note),
        updated_at: new Date().toISOString(),
      }));
      setEditingId(null);
    } catch {
      setFormError("Could not update. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await apiDeleteUserSpot(id);
      setSpots(prev => prev.filter(s => s.id !== id));
      setConfirmDeleteId(null);
    } catch {
      // silent — spot stays in list
    } finally {
      setDeletingId(null);
    }
  }

  // ── Add to Day ────────────────────────────────────────────────────────────

  function handleAddToDay(spot: UserSpot) {
    if (addingId === spot.id) return;

    // Duplicate check: same source + place_id already in this day
    const isDup = existingPlaces.some(
      p => p.source === "user_spot" && p.place_id === spot.id,
    );
    if (isDup) {
      setAddErrors(prev => ({ ...prev, [spot.id]: "This place is already in this day." }));
      return;
    }

    setAddErrors(prev => {
      const next = { ...prev };
      delete next[spot.id];
      return next;
    });

    const selectedTime = timeMap[spot.id] ?? defaultTime;
    const slot         = assignSlot(selectedTime);

    setAddingId(spot.id);
    onAddToDay(spot, selectedTime, slot);
    // brief visual feedback before clearing
    setTimeout(() => setAddingId(null), 600);
  }

  // ── Shared form JSX ───────────────────────────────────────────────────────

  function renderForm(
    onSubmit: (e: React.FormEvent) => Promise<void>,
    onCancel: () => void,
    submitLabel: string,
  ) {
    return (
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 mt-3">
        {/* Name */}
        <div>
          <label className="text-xs font-black text-[#8C6239] uppercase tracking-wider">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            maxLength={300}
            placeholder="e.g. My favourite café"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD5] text-sm font-medium text-[#2C2520] bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-black text-[#8C6239] uppercase tracking-wider">Category</label>
          <select
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value as CategoryValue }))}
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD5] text-sm font-medium text-[#2C2520] bg-white focus:outline-none focus:border-[#D4AF37]"
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Address */}
        <div>
          <label className="text-xs font-black text-[#8C6239] uppercase tracking-wider">Address <span className="font-normal normal-case text-[#8C6239]/60">(optional)</span></label>
          <input
            type="text"
            value={form.address}
            onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
            maxLength={500}
            placeholder="Street address or neighbourhood"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD5] text-sm font-medium text-[#2C2520] bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-black text-[#8C6239] uppercase tracking-wider">Note <span className="font-normal normal-case text-[#8C6239]/60">(optional)</span></label>
          <textarea
            value={form.note}
            onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
            maxLength={2000}
            rows={2}
            placeholder="Your tip, reservation note, etc."
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E6DFD5] text-sm font-medium text-[#2C2520] bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] resize-none"
          />
        </div>

        {formError && (
          <p className="text-xs text-red-500 font-medium">{formError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-60 cursor-pointer"
            style={{ backgroundColor: "#D4AF37" }}
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border border-[#E6DFD5] text-[#8C6239] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mt-5">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-black text-[#8C6239]">📍 My Places</span>
        {!loading && spots.length > 0 && (
          <span className="text-[10px] font-bold bg-[#EAE3D2]/60 text-[#8C6239] px-2 py-0.5 rounded-full">
            {spots.length}
          </span>
        )}
        {!showCreate && (
          <button
            onClick={openCreate}
            className="ml-auto text-[10px] font-black px-2.5 py-1 rounded-full text-white transition-opacity hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: "#D4AF37" }}
            title="Add a new personal place"
          >
            + Add Place
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-[#D4AF37]/40 p-4 shadow-sm mb-3">
          <p className="text-xs font-black text-[#2C2520] mb-1">New Place</p>
          {renderForm(
            handleCreate,
            () => { setShowCreate(false); setFormError(null); setForm(EMPTY_FORM); },
            "Save Place",
          )}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden shadow-sm">

        {/* Loading */}
        {loading && (
          <div className="py-8 flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#D4AF37]" />
            <span className="text-xs font-bold text-[#8C6239]">Loading…</span>
          </div>
        )}

        {/* Load error */}
        {!loading && loadError && (
          <div className="py-8 text-center">
            <p className="text-xs font-bold text-red-500 mb-2">Could not load your places.</p>
            <button
              onClick={() => void loadSpots()}
              className="text-xs font-black text-[#D4AF37] underline cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !loadError && spots.length === 0 && (
          <div className="py-10 text-center px-4">
            <p className="text-xs text-[#8C6239]/60 italic">
              Save your own restaurant, café, hotel, or hidden spot here.
            </p>
          </div>
        )}

        {/* Spot rows */}
        {!loading && !loadError && spots.map((spot, si) => {
          const isEditing       = editingId       === spot.id;
          const isConfirmDelete = confirmDeleteId === spot.id;
          const isDeleting      = deletingId      === spot.id;
          const isAdding        = addingId        === spot.id;
          const addErr          = addErrors[spot.id];
          const spotTime        = timeMap[spot.id] ?? defaultTime;

          return (
            <div
              key={spot.id}
              className={`border-b border-[#E6DFD5]/40 last:border-0 ${isEditing ? "bg-[#FAF7F2]" : "hover:bg-[#FAF7F2]/60"} transition-colors`}
            >
              {isEditing ? (
                /* ── Inline edit form ── */
                <div className="px-4 py-3">
                  <p className="text-xs font-black text-[#2C2520] mb-1">Edit Place</p>
                  {renderForm(
                    (e) => handleEdit(e, spot),
                    () => { setEditingId(null); setFormError(null); },
                    "Update",
                  )}
                </div>
              ) : (
                /* ── Normal row ── */
                <div className="px-4 py-3 flex flex-col gap-2">
                  {/* Top: name + category + actions */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-black text-[#2C2520] truncate">{spot.name}</span>
                        <span className="text-[10px] font-bold bg-[#EAE3D2] text-[#8C6239] px-1.5 py-0.5 rounded capitalize shrink-0">
                          {spot.category || "attraction"}
                        </span>
                      </div>
                      {(spot.address || spot.note) && (
                        <p className="text-[11px] text-[#8C6239]/70 mt-0.5 leading-snug line-clamp-1">
                          {spot.address || spot.note}
                        </p>
                      )}
                    </div>
                    {/* Edit / Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(spot)}
                        className="w-6 h-6 rounded-full bg-[#EAE3D2] text-[#8C6239] text-xs flex items-center justify-center hover:bg-[#D4AF37] hover:text-white transition-colors cursor-pointer"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={() => setConfirmDeleteId(spot.id)}
                        className="w-6 h-6 rounded-full bg-[#EAE3D2] text-[#8C6239] text-xs flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors cursor-pointer"
                        title="Delete"
                      >🗑️</button>
                    </div>
                  </div>

                  {/* Delete confirmation */}
                  {isConfirmDelete && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 space-y-1">
                      <p className="text-xs font-bold text-red-700">Delete this personal place?</p>
                      <p className="text-[11px] text-red-500">Trips where you already added it will not be affected.</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => void handleDelete(spot.id)}
                          disabled={!!isDeleting}
                          className="flex-1 py-1.5 rounded-lg text-xs font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Add to day: time input + button */}
                  {!isConfirmDelete && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={spotTime}
                        onChange={e => {
                          const val = e.target.value;
                          setTimeMap(prev => ({ ...prev, [spot.id]: val }));
                          setAddErrors(prev => { const n = { ...prev }; delete n[spot.id]; return n; });
                        }}
                        className="px-2 py-1.5 rounded-lg border border-[#E6DFD5] text-xs font-bold text-[#2C2520] bg-white focus:outline-none focus:border-[#D4AF37] w-[6.5rem] shrink-0"
                      />
                      <button
                        onClick={() => handleAddToDay(spot)}
                        disabled={isAdding}
                        className="flex-1 py-1.5 rounded-lg text-xs font-black text-white transition-all active:scale-95 disabled:opacity-60 cursor-pointer truncate"
                        style={{ backgroundColor: "#f97316" }}
                      >
                        {isAdding
                          ? "Added ✓"
                          : `+ Add to ${selectedDayLabel}`}
                      </button>
                    </div>
                  )}

                  {/* Duplicate / add error */}
                  {addErr && (
                    <p className="text-xs text-red-500 font-medium">{addErr}</p>
                  )}
                </div>
              )}

              {/* Separator hint at bottom of list */}
              {si === spots.length - 1 && null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
