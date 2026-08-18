"use client";

// 장소 제보(place_reports) 검토 화면 — 관리자 전용.
//
// 왜 이 화면이 필요했나
//   신고가 임계에 닿으면 관리자에게 메일이 간다. 그런데 그 메일의 링크가
//   CSV 업로더 화면으로 가고 있었다. "확인해 주세요" 라고 보내면서 확인할
//   자리를 주지 않았던 셈이다. 이 화면이 그 자리다.
//
// 무엇이 아닌가
//   관리자 홈의 "🚨 유저 신고 데이터 검증 센터" 와 다른 것이다. 그쪽은
//   spot_reactions 의 👎 dislike 집계이고, 여기는 사용자가 사유를 골라 보낸
//   place_reports 다. 두 신호는 뜻이 달라 합치지 않는다.
//
// 보안 계약 (기존 관리자 화면과 동일하게 간다)
//   · 키는 사용자가 입력한다. 코드·번들·URL 어디에도 넣지 않는다.
//   · sessionStorage 에만 둔다(탭을 닫으면 사라진다). localStorage 금지.
//   · 401 이면 저장된 키를 지우고 다시 입력받는다.
//   · 사용자가 쓴 note 는 **일반 텍스트로만** 그린다. React 기본 이스케이프에
//     맡기고 dangerouslySetInnerHTML 을 쓰지 않는다 — 검증되지 않은 남의 글을
//     HTML 로 해석하면 관리자 화면이 곧 공격 표면이 된다.
//   · reporter_key·device_id 는 애초에 API 응답에 없고, 여기서도 그리지 않는다.

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type StoryTargetState, isContradictory, canModerate,
} from "@/lib/moderation/story-target-state";
import {
  ALLOWED_TRANSITIONS, RESOLUTION_NOTE_MAX_CHARS,
} from "@/lib/reports/report-moderation-core";
import type { ReportStatus } from "@/lib/reports/place-report-core";

const SESSION_KEY = "km_admin_key";   // 기존 관리자 화면과 같은 키. 탭 수명만.

interface ReportRow {
  id: number;
  target_type: string;
  /** Story 신고에만 붙는다. 서버가 저장해 둔 실제 상태다 — 클릭 기억이 아니다. */
  story_state?: StoryTargetState;
  target_key: string;
  category: string;
  note: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  created_at: string;
  updated_at: string | null;
  resolved_at: string | null;
}

interface ListResponse {
  reports: ReportRow[];
  page: { limit: number; offset: number; sort: string; max_limit: number };
  aggregate: {
    total_reports: number;
    independent_reporters: number;
    pending_reports: number;
    recent_reports_24h: number;
    category_counts: Record<string, number>;
    latest_report_at: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending:            "🔵 미검토",
  reviewing:          "🟡 검토 중",
  resolved_corrected: "🟢 고침",
  resolved_no_change: "⚪ 문제 없음",
  resolved_hidden:    "🟠 내림(기록)",
  resolved_removed:   "🔴 제외(기록)",
  rejected:           "⛔ 반려",
  duplicate:          "🔁 중복",
};

const OPEN_STATUSES = ["pending", "reviewing"];
type View = "open" | "resolved" | "all";

const fmt = (s: string | null) => (s ? s.replace("T", " ").slice(0, 16) : "—");

function PlaceReportsInner() {
  const params = useSearchParams();
  // 이메일 딥링크. 값이 이상하면 조용히 무시하고 전체 목록을 보여 준다 —
  // 잘못된 링크 하나로 화면이 죽으면 안 된다.
  const rawType = params.get("target_type");
  const rawKey  = params.get("target_key");
  const deepType = rawType === "city_spot" ? "city_spot" : null;
  const deepKey  = rawKey && /^[0-9]{1,12}$/.test(rawKey) ? rawKey : null;
  const deepLinked = Boolean(deepType && deepKey);

  const [pw, setPw] = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(() =>
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null
  );
  const [pwError, setPwError] = useState("");

  const [data, setData]       = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [view, setView]       = useState<View>("open");
  const [busyId, setBusyId]   = useState<number | null>(null);
  const [draft, setDraft]     = useState<Record<number, string>>({});

  const [moderating,   setModerating]   = useState<string | null>(null);
  const [moderateMsg,  setModerateMsg]  = useState<{ key: string; text: string } | null>(null);

  /**
   * Story 공개 차단 / 해제.
   *
   * 차단하면 공개도 함께 내려가 Story·사진·Copy·미리보기가 한꺼번에 닫힌다.
   * **해제해도 다시 공개되지 않는다** — 다시 공개할지는 만든 사람이 정한다.
   * 어느 쪽도 사용자의 My Trip·Memory·사진·메모를 지우지 않는다.
   */
  async function moderate(itineraryId: string, hidden: boolean) {
    if (!adminKey || moderating) return;
    if (hidden && !window.confirm(
      `이 Story 의 외부 공개를 차단합니다.
사용자의 My Trip 과 Memory 원본은 삭제되지 않습니다.`
    )) return;
    setModerating(itineraryId); setModerateMsg(null);
    try {
      const res = await fetch("/api/admin/story-moderation", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body:    JSON.stringify({ itinerary_id: itineraryId, hidden }),
      });
      // 서버가 실제로 저장한 값만 믿는다. 요청이 성공했다는 것만으로
      // 색을 바꾸면, 대상이 이미 지워진 경우에도 차단된 것처럼 보인다.
      const saved = res.ok
        ? (await res.json().catch(() => null)) as { hidden?: boolean; isPublic?: boolean } | null
        : null;

      if (saved && typeof saved.hidden === "boolean") {
        setData(prev => prev && {
          ...prev,
          reports: prev.reports.map(r =>
            r.target_type === "shared_story" && r.target_key === itineraryId
              ? { ...r, story_state: {
                    targetExists: true,
                    isPublic: saved.isPublic === true,
                    moderationHidden: saved.hidden === true,
                  } }
              : r),
        });
      }

      setModerateMsg({
        key: itineraryId,
        text: saved && typeof saved.hidden === "boolean"
          ? (saved.hidden ? "공개를 차단했습니다." : "차단을 해제했습니다. 재공개는 사용자가 정합니다.")
          : res.status === 404 ? "대상 Story 가 없습니다."
          : "바꾸지 못했습니다.",
      });
    } catch {
      setModerateMsg({ key: itineraryId, text: "바꾸지 못했습니다." });
    } finally {
      setModerating(null);
    }
  }

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ limit: "100", sort: "newest" });
      if (deepType && deepKey) { q.set("target_type", deepType); q.set("target_key", deepKey); }
      const res = await fetch(`/api/admin/place-reports?${q.toString()}`, {
        headers: { "x-admin-key": key },
      });
      if (res.status === 503) { setError("서버에 ADMIN_KEY 가 설정돼 있지 않습니다."); return; }
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setAdminKey(null);
        setPwError("키가 만료됐거나 바뀌었습니다. 다시 입력해 주세요.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as ListResponse);
    } catch (e) {
      // 서버 오류 원문을 그대로 뿌리지 않는다.
      setError((e as Error).message || "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [deepType, deepKey]);

  useEffect(() => {
    if (!adminKey) return;
    let cancelled = false;
    void (async () => { if (!cancelled) await load(adminKey); })();
    return () => { cancelled = true; };
  }, [adminKey, load]);

  async function submitKey() {
    const key = pw.trim();
    if (!key) { setPwError("키를 입력해 주세요."); return; }
    sessionStorage.setItem(SESSION_KEY, key);
    setAdminKey(key);
    setPw("");
    setPwError("");
  }

  async function apply(row: ReportRow, next: ReportStatus) {
    if (!adminKey || busyId !== null) return;
    setBusyId(row.id);
    try {
      const body: Record<string, unknown> = { id: String(row.id), status: next };
      const note = (draft[row.id] ?? "").trim();
      if (note) body.resolution_note = note.slice(0, RESOLUTION_NOTE_MAX_CHARS);
      const res = await fetch("/api/admin/place-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setAdminKey(null);
        setPwError("키가 만료됐거나 바뀌었습니다. 다시 입력해 주세요.");
        return;
      }
      if (!res.ok) { setError(`변경하지 못했습니다 (HTTP ${res.status})`); return; }
      setDraft(d => { const n = { ...d }; delete n[row.id]; return n; });
      await load(adminKey);          // 서버가 정한 최종 상태로 다시 그린다
    } catch {
      setError("변경하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  // ── 인증 ──────────────────────────────────────────────────────────────────
  if (!adminKey) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-black">🛠️ gokoreamate Admin</h1>
          <p className="text-gray-400 text-sm mt-1">장소 제보 검토 — 비공개 관리자 전용</p>
          <input
            type="password" value={pw} autoFocus
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void submitKey(); }}
            placeholder="ADMIN_KEY"
            className="w-full mt-5 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm"
          />
          {pwError && <p className="text-red-400 text-xs mt-2">{pwError}</p>}
          <button
            onClick={() => void submitKey()}
            className="w-full mt-3 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg py-3 text-sm"
          >
            로그인
          </button>
          <Link href="/korea-mate-admin" className="block text-center text-xs text-gray-500 hover:text-white mt-4">
            ← 관리자 홈
          </Link>
        </div>
      </main>
    );
  }

  const rows = data?.reports ?? [];
  const shown = rows.filter(r =>
    view === "all" ? true
    : view === "open" ? OPEN_STATUSES.includes(r.status)
    : !OPEN_STATUSES.includes(r.status));

  return (
    <main className="min-h-screen bg-black text-white px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-5">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">📝 장소 제보 검토</h1>
            <p className="text-gray-400 text-xs mt-1">
              사용자가 사유를 골라 보낸 place_reports 입니다. 관리자 홈의 👎 신뢰도 이슈(spot_reactions)와는 다른 신호입니다.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => adminKey && void load(adminKey)}
              disabled={loading}
              className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg disabled:opacity-40"
            >
              {loading ? "⏳" : "🔄"} 새로고침
            </button>
            <Link href="/korea-mate-admin" className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg">
              홈
            </Link>
          </div>
        </div>

        {deepLinked && (
          <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl px-4 py-3 text-xs">
            메일에서 지목한 장소만 보고 있습니다 — <span className="font-bold">city_spot / {deepKey}</span>
            {" · "}
            <Link href="/korea-mate-admin/place-reports" className="underline hover:text-orange-300">전체 보기</Link>
          </div>
        )}

        {deepLinked && data?.aggregate && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-4 flex gap-6 text-center">
            <div>
              <p className="text-2xl font-black leading-none">{data.aggregate.total_reports}</p>
              <p className="text-[10px] text-gray-400 mt-1">총 신고 건수</p>
            </div>
            <div className="w-px bg-gray-700" />
            <div>
              <p className="text-2xl font-black leading-none">{data.aggregate.independent_reporters}</p>
              {/* 이 값은 누적이다. 지금 열려 있는 사람 수가 아니다. */}
              <p className="text-[10px] text-gray-400 mt-1">서로 다른 신고자(누적)</p>
            </div>
            <div className="w-px bg-gray-700" />
            <div>
              <p className="text-2xl font-black text-orange-400 leading-none">{data.aggregate.recent_reports_24h}</p>
              <p className="text-[10px] text-gray-400 mt-1">최근 24시간</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {([["open", "미처리"], ["resolved", "처리됨"], ["all", "전체"]] as [View, string][]).map(([v, label]) => (
            <button
              key={v} onClick={() => setView(v)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                view === v ? "bg-orange-500 text-black border-orange-500 font-bold"
                           : "border-gray-700 text-gray-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
          <span className="text-xs text-gray-500 self-center ml-1">{shown.length}건</span>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && shown.length === 0 && (
          <div className="border border-gray-800 rounded-xl px-6 py-10 text-center text-gray-500 text-sm">
            {rows.length === 0 ? "접수된 신고가 없습니다." : "이 조건에 해당하는 신고가 없습니다."}
          </div>
        )}

        <div className="space-y-3">
          {shown.map(r => {
            const next = ALLOWED_TRANSITIONS[r.status] ?? [];
            return (
              <div key={r.id} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {STATUS_LABEL[r.status] ?? r.status}
                      <span className="text-gray-500 font-normal"> · {r.category}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      #{r.id} · {r.target_type === "shared_story" ? "공개 Story" : r.target_type} /{" "}
                      {/* Story 는 공개 링크로 연다 — 관리자가 실제 공개물을 그대로 본다.
                          내부 식별자를 따로 펼치지 않는다. */}
                      <Link href={r.target_type === "shared_story"
                                    ? `/shared/${r.target_key}`
                                    : `/place/${r.target_key}`}
                            target="_blank"
                            className="underline hover:text-white">{r.target_key}</Link>
                      {" · "}접수 {fmt(r.created_at)}
                      {r.resolved_at && <> · 처리 {fmt(r.resolved_at)}</>}
                    </p>
                  </div>
                </div>

                {/* 공개 차단 — Story 신고에서만. 확인을 한 번 받는다.
                    가려도 사용자의 My Trip·Memory·사진·메모는 지워지지 않는다. */}
                {r.target_type === "shared_story" && adminKey && (() => {
                  const st      = r.story_state;
                  const hidden  = st?.moderationHidden === true;
                  const usable  = canModerate(st);
                  const busy    = moderating === r.target_key;
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 지금 가려져 있으면 눈에 띄게 다르다. hover 색과 겹치지 않도록
                          채운 배경 + 굵은 테두리로 구분하고, 상태를 글자로도 적는다.
                          이 값은 서버가 저장해 둔 것이라 F5 해도 그대로다. */}
                      <button
                        onClick={() => void moderate(r.target_key, true)}
                        disabled={busy || !usable}
                        aria-pressed={hidden}
                        className={
                          "text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-40 " +
                          (hidden
                            ? "bg-red-600 border-2 border-red-300 text-white"
                            : "bg-red-900/40 border border-red-800 text-red-200")
                        }
                      >
                        {hidden ? "차단 중" : "공개 차단"}
                      </button>
                      <button
                        onClick={() => void moderate(r.target_key, false)}
                        disabled={busy || !usable}
                        className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40"
                      >
                        차단 해제
                      </button>

                      {/* 여행이 이미 지워진 신고(#6·#7 유형). 눌러도 아무 일이 없으므로
                          버튼을 열어 두지 않는다. 신고 자체의 status 처리는 그대로 된다. */}
                      {st && !st.targetExists && (
                        <span className="text-xs text-gray-500">대상 없음 (이미 삭제됨)</span>
                      )}

                      {/* 있으면 안 되는 조합. 여기서 고치지 않는다 — 사람이 보고 정한다. */}
                      {isContradictory(st) && (
                        <span className="text-xs font-bold text-amber-300">
                          ⚠ 차단 상태와 공개 상태가 어긋납니다
                        </span>
                      )}

                      {moderateMsg?.key === r.target_key && (
                        <span className="text-xs text-gray-400">{moderateMsg.text}</span>
                      )}
                    </div>
                  );
                })()}

                {/* 사용자가 쓴 글. 일반 텍스트로만 그린다. */}
                {r.note && (
                  <p className="text-sm text-gray-200 bg-black/40 border border-gray-800 rounded-lg px-4 py-3 whitespace-pre-wrap break-words">
                    {r.note}
                  </p>
                )}
                {r.resolution_note && (
                  <p className="text-xs text-gray-400">
                    처리 메모: <span className="text-gray-300">{r.resolution_note}</span>
                  </p>
                )}

                {next.length > 0 && (
                  <div className="border-t border-gray-800 pt-3 space-y-2">
                    <input
                      value={draft[r.id] ?? ""}
                      onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))}
                      maxLength={RESOLUTION_NOTE_MAX_CHARS}
                      placeholder="처리 메모 (선택)"
                      className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      {next.map(s => (
                        <button
                          key={s} onClick={() => void apply(r, s)} disabled={busyId !== null}
                          className="text-xs border border-gray-700 hover:border-orange-500 hover:text-orange-400 px-3 py-1.5 rounded-lg disabled:opacity-40"
                        >
                          {busyId === r.id ? "…" : (STATUS_LABEL[s] ?? s)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-gray-600 leading-relaxed pt-2">
          「내림」·「제외」는 <span className="text-gray-400">판단을 적어 두는 기록</span>입니다.
          이 화면에서 장소가 자동으로 숨겨지거나 삭제되지 않고, AI 추천에도 영향을 주지 않습니다.
          실제 반영은 별도 작업입니다.
        </p>
      </div>
    </main>
  );
}

// useSearchParams 를 쓰므로 Suspense 로 감싼다 — 정적 export 에서 필요하다.
export default function AdminPlaceReportsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-500 text-sm">불러오는 중…</p>
      </main>
    }>
      <PlaceReportsInner />
    </Suspense>
  );
}
