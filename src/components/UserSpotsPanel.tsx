"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { userSpotDisplayName } from "@/lib/user-spots-api";
import { userSpotCategoryLabelKey } from "@/components/UserSpotForm";
import { compressPhotoBlob } from "@/lib/trip-moments/storage";
import { runCreateFlow } from "@/lib/user-spots/create-flow";
import { canEdit } from "@/lib/user-spots/anchor-core";
import {
  apiCreateUserSpotWithPhoto, apiUploadUserSpotPhoto,
  apiGetUserSpotPhotoUrl, apiDeleteUserSpotPhoto,
} from "@/lib/user-spots-api";
import UserSpotForm, {
  EMPTY_USER_SPOT_FORM,
  type UserSpotCategory,
  type UserSpotFormState,
} from "./UserSpotForm";
import {
  apiGetUserSpots,
  apiCreateUserSpot,
  apiUpdateUserSpot,
  apiDeleteUserSpot,
  apiSubmitUserSpot,
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

// 카테고리·폼 상태·폼 JSX 는 UserSpotForm 이 소유한다 — Picks > My Places 와 공용.
type CategoryValue = UserSpotCategory;

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

type FormState = UserSpotFormState;

const EMPTY_FORM: FormState = EMPTY_USER_SPOT_FORM;

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserSpotsPanel({
  city,
  selectedDayIndex,
  selectedDayLabel,
  existingPlaces,
  onAddToDay,
}: Props) {
  const t = useTranslations("picks");
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
  const [submittingId,    setSubmittingId]    = useState<string | null>(null);
  const [submitErrors,    setSubmitErrors]    = useState<Record<string, string>>({});
  const [formError,       setFormError]       = useState<string | null>(null);
  const [form,            setForm]            = useState<FormState>(EMPTY_FORM);
  // 사진은 폼 데이터가 아니라 별도 자산이다. 파일만 들고 바이트를 복제하지 않는다.
  const [photoFile,       setPhotoFile]       = useState<File | null>(null);
  const [photoBusy,       setPhotoBusy]       = useState(false);
  const [photoNotice,     setPhotoNotice]     = useState<string | null>(null);
  const [photoUrl,        setPhotoUrl]        = useState<string | null>(null);
  const [editingHasPhoto, setEditingHasPhoto] = useState(false);
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

  function resetPhotoState() {
    setPhotoFile(null); setPhotoBusy(false); setPhotoNotice(null);
    setPhotoUrl(null); setEditingHasPhoto(false);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId(null);
    setShowCreate(true);
    resetPhotoState();
  }

  /** 저장된 사진 삭제. 사진이 유일한 근거이면 서버가 409 로 막는다. */
  async function removeStoredPhoto(spotId: string) {
    if (photoBusy) return;
    setPhotoBusy(true); setPhotoNotice(null);
    try {
      const r = await apiDeleteUserSpotPhoto(spotId);
      if (r.ok) {
        setPhotoUrl(null); setEditingHasPhoto(false);
        setSpots(prev => prev.map(x => x.id === spotId ? { ...x, has_photo: false } : x));
        setPhotoNotice(t("photoDeleted"));
      } else if (r.code === "PHOTO_IS_ONLY_ANCHOR") {
        setPhotoNotice(t("photoOnlyAnchor"));
      } else {
        setPhotoNotice(t("photoFailed"));
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const name = form.name.trim();
    const input = {
      name: name || undefined,
      category: form.category,
      city:     city || undefined,
      address:  form.address.trim() || undefined,
      note:     form.note.trim()    || undefined,
      lat:      form.lat,
      lng:      form.lng,
    };
    setSubmitting(true);
    setFormError(null);
    setPhotoNotice(null);
    try {
      const r = await runCreateFlow(input, photoFile, {
        compress:        compressPhotoBlob,
        createJson:      async i => (await apiCreateUserSpot({
          ...i, lat: i.lat ?? undefined, lng: i.lng ?? undefined,
        })).id,
        createWithPhoto: async (i, blob) => {
          const res = await apiCreateUserSpotWithPhoto({
            ...i, lat: i.lat ?? undefined, lng: i.lng ?? undefined,
          }, blob);
          return { ok: res.ok, id: res.spot?.id };
        },
        uploadPhoto:     (id, blob) => apiUploadUserSpotPhoto(id, blob),
      });

      if (!r.created) {
        if (r.notice === "photoUnreadable") setPhotoNotice(t("photoUnreadable"));
        else setFormError(t(r.errorKey === "needAnchor" ? "needAnchor" : "saveFailed"));
        return;
      }

      // 서버가 만든 값을 다시 읽는다 — id·has_photo 를 화면이 지어내지 않는다.
      await loadSpots();
      if (r.notice === "savedPhotoFailed") {
        // 장소는 저장됐다. 폼을 닫지 않고 사진만 다시 시도할 수 있게 둔다.
        setShowCreate(false);
        setEditingId(r.spotId ?? null);
        setEditingHasPhoto(false);
        setPhotoNotice(t("savedPhotoFailed"));
        return;
      }
      setShowCreate(false);
      setForm(EMPTY_FORM);
      resetPhotoState();
    } catch {
      setFormError(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function openEdit(spot: UserSpot) {
    setForm({
      name:     spot.name ?? "",
      category: (spot.category as CategoryValue) || "attraction",
      address:  spot.address ?? "",
      note:     spot.note    ?? "",
      lat:      spot.lat ?? null,
      lng:      spot.lng ?? null,
    });
    setFormError(null);
    setShowCreate(false);
    setConfirmDeleteId(null);
    setEditingId(spot.id);
    resetPhotoState();
    setEditingHasPhoto(spot.has_photo === true);
    // 만료되는 URL 이라 폼을 열 때 한 번만 받아 온다. 저장하지 않는다.
    if (spot.has_photo) {
      void apiGetUserSpotPhotoUrl(spot.id).then(r => { if (r) setPhotoUrl(r.signedUrl); });
    }
  }

  async function handleEdit(e: React.FormEvent, spot: UserSpot) {
    e.preventDefault();
    const name = form.name.trim();
    if (!canEdit({
      lat: form.lat, lng: form.lng, hasPhoto: photoFile !== null,
      name: form.name, hasExistingPhoto: editingHasPhoto,
    })) { setFormError(t("needAnchor")); return; }
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setPhotoNotice(null);
    try {
      const input: UpdateUserSpotInput = {
        name: name || null,
        category: form.category,
        // Empty string → null (clear DB value), value → update
        address: form.address.trim() || null,
        note:    form.note.trim()    || null,
        lat:     form.lat,
        lng:     form.lng,
      };
      const ok = await apiUpdateUserSpot(spot.id, input);
      if (!ok) { setFormError(t("notFound")); return; }
      setSpots(prev => prev.map(s => s.id !== spot.id ? s : {
        ...s,
        name:     input.name === undefined ? s.name : (input.name || null),
        category: input.category,
        address:  input.address  === null ? undefined : (input.address ?? s.address),
        lat:      input.lat === null ? undefined : (input.lat ?? s.lat),
        lng:      input.lng === null ? undefined : (input.lng ?? s.lng),
        note:     input.note     === null ? undefined : (input.note    ?? s.note),
        updated_at: new Date().toISOString(),
      }));

      // 새 사진을 골랐으면 붙이거나 바꾼다. 실패해도 방금 고친 내용은 살아 있다.
      if (photoFile) {
        setPhotoBusy(true);
        try {
          const blob = await compressPhotoBlob(photoFile);
          const up   = await apiUploadUserSpotPhoto(spot.id, blob);
          if (!up.ok) { setPhotoNotice(t("photoFailed")); return; }
          setSpots(prev => prev.map(x => x.id === spot.id ? { ...x, has_photo: true } : x));
        } catch {
          setPhotoNotice(t("photoUnreadable")); return;
        } finally {
          setPhotoBusy(false);
        }
      }

      setEditingId(null);
      resetPhotoState();
    } catch {
      setFormError(t("updateFailed"));
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

  // ── Submit for public ─────────────────────────────────────────────────────

  async function handleSubmit(spot: UserSpot) {
    if (submittingId === spot.id) return;
    setSubmittingId(spot.id);
    setSubmitErrors(prev => { const n = { ...prev }; delete n[spot.id]; return n; });
    const result = await apiSubmitUserSpot(spot.id);
    if (result.ok) {
      setSpots(prev => prev.map(s =>
        s.id === spot.id ? { ...s, submission_status: "pending" } : s
      ));
    } else {
      setSubmitErrors(prev => ({ ...prev, [spot.id]: result.error ?? t("submitFailed") }));
    }
    setSubmittingId(null);
  }

  // ── Add to Day ────────────────────────────────────────────────────────────

  function handleAddToDay(spot: UserSpot) {
    if (addingId === spot.id) return;

    // Duplicate check: same source + place_id already in this day
    const isDup = existingPlaces.some(
      p => p.source === "user_spot" && p.place_id === spot.id,
    );
    if (isDup) {
      setAddErrors(prev => ({ ...prev, [spot.id]: t("alreadyInDay") }));
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
    editSpotId?: string,
  ) {
    return (
      <UserSpotForm
        form={form}
        setForm={setForm}
        formError={formError}
        submitting={submitting}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        onCancel={onCancel}
        mode={editSpotId ? "edit" : "create"}
        photoFile={photoFile}
        onPickPhoto={setPhotoFile}
        existingPhotoUrl={editSpotId ? photoUrl : null}
        hasExistingPhoto={editSpotId ? editingHasPhoto : false}
        onRemoveExistingPhoto={editSpotId ? () => void removeStoredPhoto(editSpotId) : undefined}
        photoBusy={photoBusy}
        photoNotice={photoNotice}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mt-5">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-black text-[#565D66]">📍 {t("tabMine")}</span>
        {!loading && spots.length > 0 && (
          <span className="text-[10px] font-bold bg-[#F6F7F8]/60 text-[#565D66] px-2 py-0.5 rounded-full">
            {spots.length}
          </span>
        )}
        {!showCreate && (
          <button
            onClick={openCreate}
            className="ml-auto text-[10px] font-black px-2.5 py-1 rounded-full text-white transition-opacity hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: "#FF4A2D" }}
            title={t("addPlaceTitle")}
          >
            + {t("addPlace")}
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-2xl border border-[#FF4A2D]/40 p-4 shadow-sm mb-3">
          <p className="text-xs font-black text-[#191C21] mb-1">{t("newPlace")}</p>
          {renderForm(
            handleCreate,
            () => { setShowCreate(false); setFormError(null); setForm(EMPTY_FORM); },
            t("save"),
          )}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-2xl border border-[#E5E7EA] overflow-hidden shadow-sm">

        {/* Loading */}
        {loading && (
          <div className="py-8 flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#FF4A2D]" />
            <span className="text-xs font-bold text-[#565D66]">{t("loading")}</span>
          </div>
        )}

        {/* Load error */}
        {!loading && loadError && (
          <div className="py-8 text-center">
            <p className="text-xs font-bold text-red-500 mb-2">{t("loadFailed")}</p>
            <button
              onClick={() => void loadSpots()}
              className="text-xs font-black text-[#FF4A2D] underline cursor-pointer"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !loadError && spots.length === 0 && (
          <div className="py-10 text-center px-4">
            <p className="text-xs text-[#565D66]/60 italic">
              {t("mineEmptyHint")}
            </p>
          </div>
        )}

        {/* Spot rows */}
        {!loading && !loadError && spots.map((spot, si) => {
          const isEditing       = editingId       === spot.id;
          const isConfirmDelete = confirmDeleteId === spot.id;
          const isDeleting      = deletingId      === spot.id;
          const isAdding        = addingId        === spot.id;
          const isSubmitting    = submittingId    === spot.id;
          const addErr          = addErrors[spot.id];
          const submitErr       = submitErrors[spot.id];
          const spotTime        = timeMap[spot.id] ?? defaultTime;
          const subStatus       = spot.submission_status ?? "none";

          return (
            <div
              key={spot.id}
              className={`border-b border-[#E5E7EA]/40 last:border-0 ${isEditing ? "bg-[#F6F7F8]" : "hover:bg-[#F6F7F8]/60"} transition-colors`}
            >
              {isEditing ? (
                /* ── Inline edit form ── */
                <div className="px-4 py-3">
                  <p className="text-xs font-black text-[#191C21] mb-1">{t("editPlace")}</p>
                  {renderForm(
                    (e) => handleEdit(e, spot),
                    () => { setEditingId(null); setFormError(null); resetPhotoState(); },
                    t("update"),
                    spot.id,
                  )}
                </div>
              ) : (
                /* ── Normal row ── */
                <div className="px-4 py-3 flex flex-col gap-2">
                  {/* Top: name + category + actions */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-black text-[#191C21] truncate">{userSpotDisplayName(spot, t("displayFallback"))}</span>
                        <span className="text-[10px] font-bold bg-[#F6F7F8] text-[#565D66] px-1.5 py-0.5 rounded capitalize shrink-0">
                          {(() => {
                            // 저장값은 그대로. 화면 라벨만 locale 에 맞춘다.
                            const raw = spot.category || "attraction";
                            const key = userSpotCategoryLabelKey(raw);
                            return key ? t(key) : raw;
                          })()}
                        </span>
                      </div>
                      {(spot.address || spot.note) && (
                        <p className="text-[11px] text-[#565D66]/70 mt-0.5 leading-snug line-clamp-1">
                          {spot.address || spot.note}
                        </p>
                      )}
                    </div>
                    {/* Edit / Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(spot)}
                        className="w-6 h-6 rounded-full bg-[#F6F7F8] text-[#565D66] text-xs flex items-center justify-center hover:bg-[#FF4A2D] hover:text-white transition-colors cursor-pointer"
                        title={t("edit")}
                      >✏️</button>
                      <button
                        onClick={() => setConfirmDeleteId(spot.id)}
                        className="w-6 h-6 rounded-full bg-[#F6F7F8] text-[#565D66] text-xs flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors cursor-pointer"
                        title={t("delete")}
                      >🗑️</button>
                    </div>
                  </div>

                  {/* Delete confirmation */}
                  {isConfirmDelete && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 space-y-1">
                      <p className="text-xs font-bold text-red-700">{t("deleteConfirmQ")}</p>
                      <p className="text-[11px] text-red-500">{t("deleteConfirmNote")}</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => void handleDelete(spot.id)}
                          disabled={!!isDeleting}
                          className="flex-1 py-1.5 rounded-lg text-xs font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {isDeleting ? t("deleting") : t("delete")}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Submission status / submit button */}
                  {!isConfirmDelete && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {subStatus === "pending" && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">
                          🟡 {t("statusPending")}
                        </span>
                      )}
                      {subStatus === "approved" && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                          ✅ {t("statusApproved")}
                        </span>
                      )}
                      {subStatus === "rejected" && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                          ❌ {t("statusRejected")}
                        </span>
                      )}
                      {(subStatus === "none" || subStatus === "rejected") && (
                        <button
                          onClick={() => void handleSubmit(spot)}
                          disabled={isSubmitting}
                          className="text-[10px] font-black px-2 py-0.5 rounded-full border border-[#FF4A2D]/50 text-[#565D66] hover:bg-[#FF4A2D]/10 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {/* 사용자가 만들 수 있는 상태는 pending 까지다. 공개 여부는
                              관리자가 정한다 — "public" 이라고 쓰면 누르는 순간
                              공개되는 것처럼 읽힌다. */}
                          {isSubmitting ? "…" : `📤 ${t("submitForReview")}`}
                        </button>
                      )}
                      {submitErr && (
                        <span className="text-[10px] text-red-500 font-medium">{submitErr}</span>
                      )}
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
                        className="px-2 py-1.5 rounded-lg border border-[#E5E7EA] text-xs font-bold text-[#191C21] bg-white focus:outline-none focus:border-[#FF4A2D] w-[6.5rem] shrink-0"
                      />
                      <button
                        onClick={() => handleAddToDay(spot)}
                        disabled={isAdding}
                        className="flex-1 py-1.5 rounded-lg text-xs font-black text-white transition-all active:scale-95 disabled:opacity-60 cursor-pointer truncate"
                        style={{ backgroundColor: "#FF4A2D" }}
                      >
                        {isAdding
                          ? t("addedToDay")
                          : t("addToDay", { day: selectedDayLabel })}
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
