"use client";

// 순간 기록 AI 3안 제안 (MYTRIP-AI-STORY-MAP-AND-SHARE-PREVIEW-V1).
//
// 승인 흐름(§A): 사진·장소·선택적 원문 메모가 준비되면 별도 버튼 없이 제안을
// 시작하고, 담담하게/웃기게/감성적으로 3안을 **제목+본문 쌍**으로 동시에 보여
// 준다. 사용자가 하나를 고르면 편집 필드에 들어가고, 자유롭게 고쳐 저장한다.
//
// 안전 계약:
//  · 자동 생성은 준비 조건 최초 충족 시 1회뿐이다(디바운스 900ms). 이후는
//    사용자의 "다시 제안" 명시 버튼으로만 — 입력 변경마다 호출하지 않는다.
//  · 동일 컨텍스트는 캐시를 재사용하고, 새 요청 시 진행 중 요청은 취소한다.
//  · 재생성은 카드만 갱신한다 — 사용자가 이미 편집한 필드를 덮지 않는다.
//  · 사진(MULTIMODAL-MOMENT V1 §B): canvas 전처리(재인코딩 JPEG — EXIF·GPS·
//    기기 메타데이터 제거·방향 정규화)된 픽셀만 1회 요청에 싣는다. 사용 안내를
//    화면에 표시한다(§B-3). 캐시 키에는 사진 평문이 아니라 SHA-256 해시만 쓴다.
//  · 실패한 방향은 조용히 빠진다(부분 성공 허용). 전부 실패면 실패 안내만.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { WRITING_DIRECTIONS, MOMENT3_PROMPT_VERSION, type WritingDirection, type WritingContext, type WritingImage } from "@/lib/mytrip-writing/writing-core";
import { apiSuggestMomentSet, type MomentSuggestionSet } from "@/lib/mytrip-writing/api";

const ORANGE = "#FF4A2D";

// ── 세션 캐시 (§8-3 재호출 방지) ────────────────────────────────────────────
// 같은 입력 + 같은 prompt version 이면 새 요청을 만들지 않는다. 키에는 사용자
// 메모·장소명 평문을 넣지 않고 결정적 해시만 쓴다(개인 텍스트 노출 0).
// sessionStorage 라 탭 세션 안에서만 산다 — 모달을 닫았다 다시 열어도,
// 새로고침해도 같은 입력이면 provider 호출 0. 실패(빈 세트)는 저장하지 않는다
// (다음 시도가 곧 정직한 재시도다 — 자동 무한 재시도 아님).
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function cacheKey(locale: string, context: WritingContext, imgSha: string | null): string {
  // 사진은 SHA-256 앞 16자만 — 평문 픽셀·base64 는 키에도 저장값에도 없다(§F-2)
  return `gkm_m3_${MOMENT3_PROMPT_VERSION}_${locale}_${djb2(JSON.stringify(context))}_${imgSha ?? "nophoto"}`;
}

/** data URL(image/jpeg)에서 base64 본문만 — 다른 포맷은 null(사진 없이 진행) */
function jpegBase64FromDataUrl(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  return m ? m[1]! : null;
}

async function sha256Hex16(s: string): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  } catch { return null; }
}
function cacheGet(key: string): MomentSuggestionSet | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as MomentSuggestionSet;
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}
function cachePut(key: string, set: MomentSuggestionSet): void {
  try { if (Object.keys(set).length > 0) sessionStorage.setItem(key, JSON.stringify(set)); } catch { /* private mode */ }
}

export default function MomentAiSuggest({ ready, buildContext, onPick, photoDataUrl }: {
  /** 자동 제안을 시작할 만큼 정보가 준비됐는가(장소·사진·메모 중 하나) */
  ready: boolean;
  /** 요청 시점의 실제 편집 맥락 — 미리 굳히지 않는다 */
  buildContext: () => WritingContext;
  /** 사용자가 3안 중 하나를 골랐다 — 편집 필드에 채운다 */
  onPick: (pick: { title: string; memo: string }) => void;
  /** 전처리된 미리보기 사진(data URL, canvas 재인코딩 JPEG) — 있으면 멀티모달 */
  photoDataUrl?: string | null;
}) {
  const t = useTranslations("aiWrite");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [set, setSet] = useState<MomentSuggestionSet | null>(null);
  const [picked, setPicked] = useState<WritingDirection | null>(null);
  const autoRan = useRef(false);
  const inflight = useRef<AbortController | null>(null);
  const cache = useRef<Map<string, MomentSuggestionSet>>(new Map());

  const run = useCallback(async (opts?: { forceFresh?: boolean }) => {
    const context = buildContext();
    // 사진이 있으면 멀티모달 입력을 만든다(§A-1). base64 해시는 캐시 키 전용 —
    // 실패(sha null)해도 요청은 진행하되 캐시만 못 쓴다.
    const b64 = jpegBase64FromDataUrl(photoDataUrl);
    const image: WritingImage | null = b64 ? { mimeType: "image/jpeg", data: b64 } : null;
    const imgSha = b64 ? await sha256Hex16(b64) : null;
    const key = cacheKey(locale, context, imgSha);
    // 명시적 "다시 제안"(forceFresh)만 캐시를 지나친다 — 새 결과가 목적이므로.
    if (!opts?.forceFresh && (b64 === null || imgSha !== null)) {
      const cached = cache.current.get(key) ?? cacheGet(key);
      if (cached && Object.keys(cached).length > 0) { setSet(cached); setFailed(false); return; }
    }
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true); setFailed(false);
    const out = await apiSuggestMomentSet({ locale, context, image, signal: controller.signal });
    if (controller.signal.aborted) return;
    setBusy(false);
    cache.current.set(key, out);
    cachePut(key, out);
    setSet(out);
    setPicked(null);
    setFailed(Object.keys(out).length === 0);
  }, [buildContext, locale, photoDataUrl]);

  // 자동 제안 — 준비 조건 최초 충족 시 1회, 900ms 디바운스(연속 입력 흡수).
  // run 은 ref 로 본다 — buildContext 가 렌더마다 새 함수라 run 을 deps 에 두면
  // 매 렌더 cleanup 이 타이머를 지우고 autoRan 은 이미 true 라 다시 걸리지 않아
  // 자동 제안이 영영 발화하지 않는다(격리 QA 실측).
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => {
    if (!ready || autoRan.current) return;
    autoRan.current = true;
    const timer = setTimeout(() => { void runRef.current(); }, 900);
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => () => inflight.current?.abort(), []);

  const dirLabel = (d: WritingDirection) => t(`dir_${d}`);

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">{t("suggestHeading")}</p>
        <button
          type="button" onClick={() => void run({ forceFresh: true })} disabled={busy}
          className="px-2.5 py-1 rounded-full text-[11.5px] font-bold border min-h-8 disabled:opacity-50"
          style={{ borderColor: ORANGE, color: "#ffb3a6" }}
        >
          {busy ? t("busy") : t("regenerate")}
        </button>
      </div>

      {/* §B-3 사진 사용 안내 — 사진이 첨부된 제안에서만, 공개 Story 에는 없다 */}
      {photoDataUrl ? (
        <p className="mt-1 text-[10.5px] text-white/35">{t("photoUseNotice")}</p>
      ) : null}

      {busy && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-white/50" role="status">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-[#FF4A2D] animate-spin" aria-hidden />
          {t("suggestBusy")}
        </div>
      )}
      {!busy && failed && (
        <p className="mt-2 text-[11.5px] text-white/50" role="status">{t("suggestFailed")}</p>
      )}

      {!busy && set && Object.keys(set).length > 0 && (
        <>
          <div className="mt-2 space-y-2" role="group" aria-label={t("suggestHeading")}>
            {WRITING_DIRECTIONS.map(d => {
              const s = set[d];
              if (!s) return null;
              const active = picked === d;
              return (
                <button
                  key={d} type="button"
                  onClick={() => { setPicked(d); onPick(s); }}
                  aria-pressed={active}
                  className={`w-full text-left rounded-2xl border px-3.5 py-3 transition-colors ${
                    active ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                  }`}
                  style={{ borderColor: active ? ORANGE : "rgba(255,255,255,.15)" }}
                >
                  <span className="block text-[10.5px] font-bold uppercase tracking-widest" style={{ color: "#ffb3a6" }}>
                    {dirLabel(d)}
                  </span>
                  <span className="mt-1 block text-[14px] font-bold text-white leading-snug">{s.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-white/70 leading-relaxed">{s.memo}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-white/40">{t("pickHint")}</p>
        </>
      )}
    </div>
  );
}
