"use client";

// gokoreamate — Trip Moment Timeline
// TASK-022: 기록된 순간들의 아름다운 타임라인 뷰

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { TripMoment } from "@/lib/trip-moments/types";
import { MOMENT_CATEGORIES } from "@/lib/trip-moments/types";

const MEMO_MAX = 2000;

interface Props {
  moments:       TripMoment[];
  onDelete:      (momentId: string) => void;
  onAddMemory:   () => void;
  /** memo 수정 — 미전달 시 Edit 버튼을 노출하지 않는다 (공유·읽기 전용 화면 대비) */
  onEditMemo?:   (momentId: string, memo: string) => Promise<void>;
}

const CAT_COLORS: Record<string, string> = {
  food:    "#FF4A2D",
  scenery: "#16a34a",
  people:  "#7c3aed",
  culture: "#d97706",
  random:  "#FF4A2D",
};

export default function TripMomentTimeline({ moments, onDelete, onAddMemory, onEditMemo }: Props) {
  const t = useTranslations("memo");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [draft,         setDraft]         = useState("");
  const [saving,        setSaving]        = useState(false);
  const [editError,     setEditError]     = useState(false);

  const over = draft.trim().length - MEMO_MAX;

  const startEdit = useCallback((m: TripMoment) => {
    setEditingId(m.moment_id);
    setDraft(m.memo ?? "");
    setEditError(false);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft("");
    setEditError(false);
  }, []);

  const saveEdit = useCallback(async (momentId: string) => {
    if (!onEditMemo || saving) return;             // 저장 중 중복 요청 방지
    if (draft.trim().length > MEMO_MAX) return;
    setSaving(true);
    setEditError(false);
    try {
      await onEditMemo(momentId, draft);
      setEditingId(null);
      setDraft("");
    } catch {
      setEditError(true);                          // 실패 시 편집창 유지, 원본 보존
    } finally {
      setSaving(false);
    }
  }, [onEditMemo, draft, saving]);

  const handleDelete = useCallback((id: string) => {
    if (deleteConfirm === id) {
      onDelete(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  }, [deleteConfirm, onDelete]);

  if (moments.length === 0) {
    return (
      <div
        className="rounded-3xl border-2 border-dashed border-[#E5E7EA] p-10 text-center flex flex-col items-center gap-4 cursor-pointer hover:border-[#FF4A2D] transition-colors"
        onClick={onAddMemory}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#F6F7F8] flex items-center justify-center text-3xl">📸</div>
        <div>
          <p className="text-base font-black text-[#191C21]">{t("emptyTitle")}</p>
          <p className="text-sm text-[#565D66] mt-1">{t("emptyLine1")}<br/>{t("emptyLine2")}</p>
        </div>
        <button
          className="mt-2 px-6 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95"
          style={{ backgroundColor: "#FF4A2D" }}
        >
          {t("addMemory")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {moments.map((m, i) => {
        const cat      = MOMENT_CATEGORIES.find(c => c.key === m.category) ?? MOMENT_CATEGORIES[4];
        const color    = CAT_COLORS[m.category] ?? "#FF4A2D";
        const isOpen   = expanded === m.moment_id;
        const dateStr  = new Date(m.captured_at).toLocaleString("ko-KR", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });

        // 동기화 상태 배지 — 사진 없는 텍스트 Memory 에는 사진 배지를 달지 않는다.
        // 로컬 저장은 이미 끝났으므로 "대기"이지 "실패"가 아니다.
        const syncKey: "syncPendingMeta" | "syncPendingPhoto" | "syncDone" | null =
          !m.synced                                   ? "syncPendingMeta"
          : m.photo_data && m.has_photo !== true      ? "syncPendingPhoto"
          : m.photo_data                              ? "syncDone"
          : null;
        const syncTone = syncKey === "syncDone"
          ? { bg: "#E8F5EC", fg: "#1B7F3B" }
          : { bg: "#FFF1EC", fg: "#B33A22" };

        return (
          <div
            key={m.moment_id}
            className="bg-white rounded-2xl border border-[#E5E7EA] overflow-hidden shadow-sm"
            style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.06}s both` }}
          >
            {syncKey && (
              <div className="px-4 pt-3">
                <span
                  className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: syncTone.bg, color: syncTone.fg }}
                >
                  {t(syncKey)}
                </span>
              </div>
            )}

            {/* 사진 */}
            {m.photo_data && (
              <div
                className="relative w-full overflow-hidden cursor-pointer"
                style={{ maxHeight: isOpen ? 400 : 200 }}
                onClick={() => setExpanded(isOpen ? null : m.moment_id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.photo_data}
                  alt={m.memo || cat.label}
                  className="w-full object-cover transition-all duration-500"
                  style={{ maxHeight: isOpen ? 400 : 200 }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                  <span
                    className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
                    style={{ backgroundColor: color }}
                  >
                    {cat.emoji} {cat.label}
                  </span>
                  {m.day_number !== null && (
                    <span className="text-xs font-bold bg-black/50 text-white px-2 py-1 rounded-lg backdrop-blur-sm">
                      Day {m.day_number}
                    </span>
                  )}
                </div>
                <div className="absolute top-3 right-3 text-xs text-white/70 font-medium bg-black/40 px-2 py-1 rounded-lg backdrop-blur-sm">
                  {isOpen ? "collapse ↑" : "expand ↓"}
                </div>
              </div>
            )}

            {/* 사진 없을 때 카테고리 배지 */}
            {!m.photo_data && (
              <div
                className="px-5 pt-4 pb-0 flex items-center gap-2"
              >
                <span
                  className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
                  style={{ backgroundColor: color }}
                >
                  {cat.emoji} {cat.label}
                </span>
                {m.day_number !== null && (
                  <span className="text-xs font-bold bg-[#F6F7F8] text-[#565D66] px-2 py-1 rounded-lg">
                    Day {m.day_number}
                  </span>
                )}
              </div>
            )}

            {/* 내용 */}
            <div className="px-5 py-4 space-y-2.5">
              {editingId === m.moment_id ? (
                /* 편집 모드 — Fable 토큰 유지, Timeline 구조 그대로 */
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(m.moment_id); }
                    }}
                    rows={3}
                    disabled={saving}
                    placeholder={t("placeholder")}
                    aria-label={t("edit")}
                    className="gkm-focus w-full text-sm text-[#191C21] leading-relaxed rounded-xl border border-[#E5E7EA] bg-white px-3 py-2 resize-y disabled:opacity-60"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-medium ${over > 0 ? "text-[#D23B2E]" : "text-[#565D66]/60"}`}>
                      {over > 0 ? t("tooLong", { n: over }) : t("remaining", { n: MEMO_MAX - draft.trim().length })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="gkm-focus text-xs font-bold px-3 py-1.5 rounded-lg text-[#565D66] hover:bg-[#F6F7F8] disabled:opacity-50 cursor-pointer"
                      >{t("cancel")}</button>
                      <button
                        onClick={() => void saveEdit(m.moment_id)}
                        disabled={saving || over > 0}
                        className="gkm-focus text-xs font-bold px-3 py-1.5 rounded-lg bg-[#FF4A2D] text-white hover:bg-[#D93317] disabled:opacity-50 cursor-pointer"
                      >{saving ? t("saving") : t("save")}</button>
                    </div>
                  </div>
                  {editError && (
                    <p className="text-xs font-semibold text-[#D23B2E] bg-[#FDF1EF] rounded-lg px-3 py-2">
                      {t("saveFailed")}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {m.memo && (
                    <p className="text-sm text-[#191C21] leading-relaxed font-medium whitespace-pre-line">
                      {m.memo}
                    </p>
                  )}
                  {!m.memo && (
                    <p className="text-sm text-[#565D66]/60 italic">{t("noMemo")}</p>
                  )}
                </>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-[#565D66]/60">
                  <span>🕐 {dateStr}</span>
                  {m.lat !== null && (
                    <span>📍 {m.location_label}</span>
                  )}
                  {m.synced && (
                    <span className="text-emerald-500">☁️</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {onEditMemo && editingId !== m.moment_id && (
                    <button
                      onClick={() => startEdit(m)}
                      className="gkm-focus text-xs font-bold px-3 py-1.5 rounded-lg text-[#565D66]/60 hover:text-[#191C21] hover:bg-[#F6F7F8] transition-all cursor-pointer"
                    >
                      {t("edit")}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(m.moment_id)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      deleteConfirm === m.moment_id
                        ? "bg-red-500 text-white"
                        : "text-[#565D66]/40 hover:text-red-400 hover:bg-red-50"
                    }`}
                  >
                    {deleteConfirm === m.moment_id ? "Confirm delete" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
