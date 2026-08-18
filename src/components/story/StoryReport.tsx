"use client";

// 공개 Story 신고.
//
// 자리
//   Story 맨 아래, 브랜드 워드마크 근처의 조용한 글자 하나다. Cover 나 Memory
//   카드마다 신고 버튼을 붙이지 않는다 — 남의 여행을 읽는 화면인데 신고가
//   먼저 눈에 들어오면 그건 다른 종류의 화면이 된다.
//
// 신고는 숨김이 아니다
//   보낸다고 아무것도 가려지지 않는다. 사람이 보고 정한다. 그 사실을 확인 창에
//   적어 둔다 — "눌렀는데 왜 그대로냐" 는 오해를 미리 막는다.
//
// 로그인이 필요 없다
//   공개 Story 를 보는 사람이 곧 신고할 사람이다. 기기 식별값은 같은 사람이
//   같은 것을 하루에 여러 번 넣지 않게 하는 데만 쓰이고, 서버는 그 값을 그대로
//   저장하지 않는다(해시만 남긴다).

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MARGIN_MOBILE, BODY_SM, TITLE_MD, BODY_LG,
  ON_SURFACE, ON_SURFACE_VARIANT, SURFACE_VARIANT,
} from "./story-tokens";

/** 서버가 받는 값과 화면 문구를 한 줄로 묶어 둔다 */
const REASONS = [
  { value: "inappropriate_content", key: "reportInappropriate" },
  { value: "privacy_concern",       key: "reportPrivacy" },
  { value: "rights_concern",        key: "reportRights" },
  { value: "spam_or_misleading",    key: "reportSpam" },
  { value: "other",                 key: "reportOther" },
] as const;

const NOTE_MAX = 500;

interface Props {
  /** 공유 링크에 이미 들어 있는 여행 id. 내부 식별자를 새로 드러내지 않는다. */
  shareId: string;
  /** 중복 방지에만 쓰인다. 없으면 없는 대로 보낸다. */
  deviceId?: string;
}

export default function StoryReport({ shareId, deviceId }: Props) {
  const t = useTranslations("story");
  const [open,   setOpen]   = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note,   setNote]   = useState("");
  const [busy,   setBusy]   = useState(false);
  const [done,   setDone]   = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    if (!reason || busy) return;
    setBusy(true); setFailed(false);
    try {
      const res = await fetch("/api/story-report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          target_key: shareId,
          category:   reason,
          note:       note.trim() || null,
          ...(deviceId ? { device_id: deviceId } : {}),
        }),
      });
      if (res.ok) { setDone(true); setOpen(false); }
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="text-center"
      style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingBottom: 32 }}
    >
      {done ? (
        <p style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>{t("reportThanks")}</p>
      ) : (
        <button
          type="button"
          onClick={() => { setOpen(true); setFailed(false); }}
          className="gkm-focus underline underline-offset-4"
          style={{ ...BODY_SM, color: `${ON_SURFACE_VARIANT}99` }}
        >
          {t("reportStory")}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          role="dialog" aria-modal="true" aria-label={t("reportTitle")}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 text-left">
            <h3 style={{ ...TITLE_MD, color: ON_SURFACE }}>{t("reportTitle")}</h3>
            {/* 자동으로 가려지지 않는다는 사실을 먼저 말한다 */}
            <p className="mt-1" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>
              {t("reportSubtitle")}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {REASONS.map(r => (
                <label key={r.value} className="flex items-center gap-2" style={{ ...BODY_LG, color: ON_SURFACE }}>
                  <input
                    type="radio" name="story-report-reason" value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="shrink-0"
                  />
                  <span>{t(r.key)}</span>
                </label>
              ))}
            </div>

            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder={t("reportDetail")}
              className="mt-3 w-full rounded-xl px-3 py-2 resize-none"
              style={{ ...BODY_SM, color: ON_SURFACE, border: `1px solid ${SURFACE_VARIANT}` }}
            />

            {failed && (
              <p role="alert" className="mt-2" style={{ ...BODY_SM, color: "#ba1a1a" }}>
                {t("reportFailed")}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button" onClick={() => setOpen(false)}
                className="gkm-focus flex-1 min-h-11 rounded-xl"
                style={{ ...TITLE_MD, color: ON_SURFACE_VARIANT, border: `1px solid ${SURFACE_VARIANT}` }}
              >
                {t("reportCancel")}
              </button>
              <button
                type="button" onClick={() => void submit()}
                disabled={!reason || busy}
                className="gkm-focus flex-1 min-h-11 rounded-xl text-white disabled:opacity-50"
                style={{ ...TITLE_MD, backgroundColor: ON_SURFACE }}
              >
                {busy ? t("reportSending") : t("reportSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
