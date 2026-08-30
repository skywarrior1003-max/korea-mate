"use client";
import GlyphIcon from "@/components/ui/GlyphIcon";

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
  /** day 를 넘기면 Capture 가 그 Day 를 기본 선택으로 연다 */
  onAddMemory:   (day?: number | null) => void;
  /** 이 일정의 Day 번호 목록. Day 별 기록 추가를 제안하는 데만 쓴다 */
  dayNumbers?:   number[];
  /** memo 수정 — 미전달 시 Edit 버튼을 노출하지 않는다 (공유·읽기 전용 화면 대비) */
  onEditMemo?:   (momentId: string, memo: string) => Promise<void>;

  // ── Trip Cover 연결 (V1B) ───────────────────────────────────────────────
  /** 일정 공개 여부. 새 개인 커버 "선택"은 공개 일정에서만 허용된다 */
  isPublic?:        boolean;
  /** 현재 개인 커버로 지정된 moment (cover_kind="moment" 일 때만) */
  currentCoverMomentId?: string | null;
  /** 커버 지정 요청 — 동의 절차는 상위(CoverConsentDialog)가 담당한다 */
  onUseAsCover?:    (momentId: string) => void;
  /** 개인 커버 해제 → 관광 커버. 공개를 줄이는 작업이라 추가 동의를 요구하지 않는다 */
  onClearCover?:    () => void;
  /**
   * 이 Memory 를 공개 Story 에 포함/제외. **주지 않으면 그 버튼을 그리지 않는다** —
   * 눌러도 아무 일 없는 control 을 두지 않기 위해서다.
   * 켜는 요청은 동의 확인을 통과한 뒤에만 온다(이 컴포넌트가 확인 창을 띄운다).
   */
  onSetPublic?:  (momentId: string, next: boolean) => Promise<boolean>;
  /** 커버 변경 진행 중 — 버튼 중복 클릭 방지 */
  coverBusy?:       boolean;
  /**
   * 사진 로드 실패(만료된 서명 주소 등). 상위가 그 순간의 해석을 한 번 다시 받는다.
   * 미전달이면 아무 일도 없다. (TASK-STORY-CROSS-DEVICE-PHOTOS-V1-R1)
   */
  onPhotoError?: (momentId: string) => void;
}

const CAT_COLORS: Record<string, string> = {
  food:    "#FF4A2D",
  scenery: "#16a34a",
  people:  "#7c3aed",
  culture: "#d97706",
  random:  "#FF4A2D",
};

/**
 * Day 단위로 묶어 최신 Day 가 위로 오게 정렬한다.
 *
 * 최종 디자인의 타임라인은 "여행 전체가 하나의 기록"이라는 것을 Day 마커와
 * 점선 축으로 보여준다. Day 가 없는 기록(day_number = null)은 버리지 않고
 * 맨 아래 한 묶음으로 남긴다 — 기록을 화면 밖으로 밀어내지 않는다.
 */
function groupByDay(moments: TripMoment[]): { day: number | null; items: TripMoment[] }[] {
  const buckets = new Map<number | null, TripMoment[]>();
  for (const m of moments) {
    const k = m.day_number;
    const cur = buckets.get(k);
    if (cur) cur.push(m);
    else buckets.set(k, [m]);
  }
  return [...buckets.entries()]
    .map(([day, items]) => ({
      day,
      items: [...items].sort(
        (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime(),
      ),
    }))
    .sort((a, b) => {
      if (a.day === null) return 1;
      if (b.day === null) return -1;
      return b.day - a.day;
    });
}

export default function TripMomentTimeline({
  moments, onDelete, onAddMemory, onEditMemo, dayNumbers = [], onPhotoError,
  isPublic = false, currentCoverMomentId = null,
  onUseAsCover, onClearCover, coverBusy = false, onSetPublic,
}: Props) {
  const t = useTranslations("memo");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  /** 공개 확인 창을 띄운 Memory. 켜기 요청에만 뜬다 — 끄기는 묻지 않는다. */
  const [consentFor,  setConsentFor]  = useState<TripMoment | null>(null);
  const [consentOk1,  setConsentOk1]  = useState(false);
  const [consentOk2,  setConsentOk2]  = useState(false);
  const [publicBusy,  setPublicBusy]  = useState<string | null>(null);
  const [publicErr,   setPublicErr]   = useState<string | null>(null);

  function openConsent(m: TripMoment) {
    setConsentOk1(false); setConsentOk2(false); setPublicErr(null); setConsentFor(m);
  }

  async function applyPublic(m: TripMoment, next: boolean) {
    if (!onSetPublic || publicBusy) return;
    setPublicBusy(m.moment_id); setPublicErr(null);
    const ok = await onSetPublic(m.moment_id, next);
    setPublicBusy(null);
    if (ok) setConsentFor(null);
    else    setPublicErr(m.moment_id);
  }

  /** 확인 창이 무엇을 공개한다고 말할지 — 실제 상태 그대로 (거짓 문구 금지) */
  function consentLine(m: TripMoment): { key: string; n: number } {
    const n = (m.photo_data ? 1 : 0) + (m.photo_data_extra?.length ?? 0);
    const hasMemo = m.memo.trim().length > 0;
    if (n > 0 && hasMemo) return { key: "consentPhotosAndMemo", n };
    if (n > 0)            return { key: "consentPhotosOnly",    n };
    if (hasMemo)          return { key: "consentMemoOnly",      n };
    return { key: "consentNothingYet", n };
  }
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
        onClick={() => onAddMemory()}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#F6F7F8] flex items-center justify-center text-[#565D66]"><GlyphIcon kind="camera" size={28} /></div>
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

  const groups   = groupByDay(moments);
  const tripDays = new Set(dayNumbers);

  return (
    <div>
      {groups.map((group, gi) => {
      const isLastGroup = gi === groups.length - 1;
      // 그 Day 의 마지막 기록 시각을 묶음 라벨로 쓴다 — 새로 만든 값이 아니다
      const groupDate = group.items[0]
        ? new Date(group.items[0].captured_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
        : "";

      return (
        <div key={String(group.day)} className="flex gap-3 sm:gap-4">
          {/* 점선 축 + Day 마커 — 흩어진 카드가 아니라 한 여행의 흐름으로 읽히게 한다 */}
          <div className="flex flex-col items-center shrink-0 w-9">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
              style={{ backgroundColor: group.day === null ? "#565D66" : "#1a1a2e" }}
            >
              {group.day === null ? "•" : group.day}
            </span>
            {!isLastGroup && <span className="w-0 flex-1 border-l-2 border-dashed border-[#E5E7EA]" />}
          </div>

          <div className={`flex-1 min-w-0 ${isLastGroup ? "" : "pb-8"}`}>
            <div className="flex items-center justify-between gap-2 h-9">
              <h3 className="text-base font-black text-[#191C21] truncate">
                {group.day === null ? t("dayUnassigned") : `Day ${group.day}`}
              </h3>
              {groupDate && (
                <span className="text-xs font-bold text-[#565D66]/60 shrink-0">{groupDate}</span>
              )}
            </div>

            <div className="space-y-4 pt-2">
      {group.items.map((m, i) => {
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
        // 현재 표지인가 / 새 표지로 고를 수 있는가
        const isCover = currentCoverMomentId !== null && currentCoverMomentId === m.moment_id;
        const canBeCover =
          !isCover && isPublic && m.synced && m.has_photo === true && Boolean(m.photo_data);

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

            {/* 사진 — 여러 장이면 옆으로 넘겨 본다.
                메모·장소·날짜는 Memory 에 한 번이지 사진마다 붙지 않는다. */}
            {m.photo_data && (
              <div
                className="relative w-full overflow-hidden cursor-pointer"
                style={{ maxHeight: isOpen ? 400 : 200 }}
                onClick={() => setExpanded(isOpen ? null : m.moment_id)}
              >
                {(m.photo_data_extra?.length ?? 0) > 0 ? (
                  <div className="flex overflow-x-auto snap-x snap-mandatory">
                    {[m.photo_data, ...(m.photo_data_extra ?? [])].map((src, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={`${i}-${src.slice(-16)}`}
                        src={src}
                        alt={i === 0 ? (m.memo || cat.label) : ""}
                        className="w-full shrink-0 snap-center object-cover transition-all duration-500"
                        style={{ maxHeight: isOpen ? 400 : 200 }}
                        onError={() => onPhotoError?.(m.moment_id)}
                      />
                    ))}
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.photo_data}
                    alt={m.memo || cat.label}
                    className="w-full object-cover transition-all duration-500"
                    style={{ maxHeight: isOpen ? 400 : 200 }}
                    onError={() => onPhotoError?.(m.moment_id)}
                  />
                )}
                {(m.photo_data_extra?.length ?? 0) > 0 && (
                  <span className="absolute top-3 right-3 text-[11px] font-black px-2 py-1 rounded-lg bg-black/60 text-white backdrop-blur-sm">
                    {t("photoCount", { n: 1 + (m.photo_data_extra?.length ?? 0) })}
                  </span>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
                  <span
                    className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
                    style={{ backgroundColor: color }}
                  >
                    {cat.emoji} {cat.label}
                  </span>
                  {/* Day 배지는 왼쪽 축 마커가 대신한다 — 같은 줄에 두 번 쓰지 않는다 */}
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
                {/* Day 배지는 왼쪽 축 마커가 대신한다 */}
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
                  {/* 최종 디자인은 메모를 여행자 본인의 목소리로 읽히게 둔다 —
                      설명문이 아니라 그때 쓴 문장이다. */}
                  {m.memo && (
                    <p className="text-sm text-[#191C21] leading-relaxed font-medium italic whitespace-pre-line">
                      “{m.memo}”
                    </p>
                  )}
                  {!m.memo && (
                    <p className="text-sm text-[#565D66]/60 italic">{t("noMemo")}</p>
                  )}
                </>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-[#565D66]/60">
                  <span className="inline-flex items-center gap-1"><GlyphIcon kind="clock" size={12} />{dateStr}</span>
                  {/* 사람이 적은 장소 이름이 있으면 그것을 보여 준다. 없을 때만
                      좌표 힌트로 떨어진다 — 좌표는 이름이 아니다. */}
                  {m.place_name
                    ? <span>{m.place_name}</span>
                    : m.lat !== null && <span className="inline-flex items-center gap-1"><GlyphIcon kind="pin" size={12} />{m.location_label}</span>}
                  {m.synced && (
                    <span className="text-emerald-500 inline-flex"><GlyphIcon kind="cloud" size={12} /></span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {/* 현재 표지 — 재설정 대신 상태 표시 + 해제.
                      해제는 공개를 줄이는 작업이라 비공개 일정에서도 허용한다. */}
                  {isCover && (
                    <>
                      <span
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
                        style={{ backgroundColor: "#FFF1EC", color: "#B33A22" }}
                      >
                        {t("currentCover")}
                      </span>
                      {onClearCover && (
                        <button
                          onClick={onClearCover}
                          disabled={coverBusy}
                          className="gkm-focus text-xs font-bold px-3 py-1.5 rounded-lg text-[#565D66]/60 hover:text-[#191C21] hover:bg-[#F6F7F8] transition-all disabled:opacity-50 cursor-pointer"
                        >
                          {t("useTourismCover")}
                        </button>
                      )}
                    </>
                  )}

                  {/* 새 개인 커버 선택 — 공개 일정 + 서버 동기화 완료 사진만 */}
                  {canBeCover && onUseAsCover && (
                    <button
                      onClick={() => onUseAsCover(m.moment_id)}
                      disabled={coverBusy}
                      className="gkm-focus text-xs font-bold px-3 py-1.5 rounded-lg text-[#565D66]/60 hover:text-[#191C21] hover:bg-[#F6F7F8] transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {t("makeCover")}
                    </button>
                  )}

                  {/* 공개 스토리 포함 여부. 콜백이 없으면 그리지 않는다. */}
                  {onSetPublic && (
                    <button
                      onClick={() => m.is_public ? void applyPublic(m, false) : openConsent(m)}
                      disabled={publicBusy === m.moment_id}
                      aria-pressed={m.is_public === true}
                      className={`gkm-focus text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 cursor-pointer ${
                        m.is_public
                          ? "text-[#191C21] bg-[#F6F7F8]"
                          : "text-[#565D66]/60 hover:text-[#191C21] hover:bg-[#F6F7F8]"
                      }`}
                    >
                      {m.is_public ? t("publicOn") : t("makePublic")}
                    </button>
                  )}
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

              {/* 그 Day 에 바로 이어 붙이는 기록 추가. 상단 버튼은 어느 Day 인지
                  묻지 않지만 이 버튼은 이미 그 Day 안에 있다. */}
              {group.day !== null && tripDays.has(group.day) && (
                <button
                  onClick={() => onAddMemory(group.day)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-[#E5E7EA] text-[11px] font-black uppercase tracking-[0.12em] text-[#565D66]/70 hover:border-[#FF4A2D] hover:text-[#FF4A2D] transition-colors cursor-pointer"
                >
                  ＋ {t("addMemoryToDay", { n: group.day })}
                </button>
              )}
            </div>
          </div>
        </div>
      );
      })}

      {/* 공개 확인 — 커버 동의와 같은 방식이다. 다만 범위가 다르므로 문구도 다르다:
          이건 커버 한 장이 아니라 이 Memory 의 사진 전부와 메모다. */}
      {consentFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
             role="dialog" aria-modal="true" aria-label={t("consentTitle")}>
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-xl">
            <h3 className="text-base font-black text-[#191C21]">{t("consentTitle")}</h3>
            <p className="mt-2 text-sm text-[#565D66]">
              {t(consentLine(consentFor).key, { n: consentLine(consentFor).n })}
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-[#565D66]/80">
              <li>· {t("consentScopeAnyone")}</li>
              <li>· {t("consentScopeTripPublic")}</li>
            </ul>
            <label className="mt-4 flex items-start gap-2 text-xs text-[#191C21]">
              <input type="checkbox" checked={consentOk1} onChange={e => setConsentOk1(e.target.checked)}
                     className="mt-0.5 shrink-0" />
              <span>{t("consentCheckRights")}</span>
            </label>
            <label className="mt-2 flex items-start gap-2 text-xs text-[#191C21]">
              <input type="checkbox" checked={consentOk2} onChange={e => setConsentOk2(e.target.checked)}
                     className="mt-0.5 shrink-0" />
              <span>{t("consentCheckUnderstand")}</span>
            </label>
            {publicErr === consentFor.moment_id && (
              <p role="alert" className="mt-3 text-xs font-medium text-red-500">{t("publicFailed")}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConsentFor(null)}
                      className="gkm-focus flex-1 min-h-11 rounded-xl border border-[#E5E7EA] text-sm font-bold text-[#565D66]">
                {t("consentCancel")}
              </button>
              <button
                onClick={() => void applyPublic(consentFor, true)}
                disabled={!consentOk1 || !consentOk2 || publicBusy === consentFor.moment_id}
                className="gkm-focus flex-1 min-h-11 rounded-xl text-sm font-black text-white disabled:opacity-50"
                style={{ backgroundColor: "#191C21" }}
              >
                {publicBusy === consentFor.moment_id ? t("consentApplying") : t("consentApply")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
