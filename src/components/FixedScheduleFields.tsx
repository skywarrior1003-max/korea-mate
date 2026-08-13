"use client";

// This Trip 카드 하나의 날짜·시간 설정.
//
// 평소 카드는 건드리지 않는다. 오른쪽 액션 그룹에 시계 아이콘 하나만 있고,
// 그것을 눌렀을 때만 입력이 펼쳐진다. 시간을 정한 카드는 한 줄 요약을 갖고,
// 그 줄을 눌러도 다시 열린다.
//
// 사용자에게는 Date / Start / End 만 묻는다. 사람은 "몇 분 걸리나요" 로
// 생각하지 않고 언제 시작해서 언제 끝나는지로 생각한다. 저장 구조의
// durationMinutes 는 두 시각의 차이일 뿐이고 화면에 나오지 않는다.
//
// "Fixed" 라는 말은 어디에도 쓰지 않는다. 그건 스케줄러 안쪽 이름이다.

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  validateFixedRange, toRangeDraft, fixedEndTime, timeToMinutes,
  type FixedErrorCode,
} from "@/lib/trip-fixed/fixed-core";
import type { CartFixed } from "@/lib/cart";

const ERROR_KEY: Record<FixedErrorCode, string> = {
  missingDate:      "errMissingDate",
  missingTime:      "errMissingTime",
  missingEnd:       "errMissingEnd",
  endBeforeStart:   "errEndBeforeStart",
  missingDuration:  "errMissingDuration",
  durationTooLong:  "errDurationTooLong",
  dateOutOfTrip:    "errDateOutOfTrip",
  endsPastMidnight: "errEndsPastMidnight",
};

/** "2026-10-17" + "19:00"~"21:00" → "Oct 17 · 7:00–9:00 PM" (locale 별 표기) */
export function formatFixedSummary(fixed: CartFixed, locale: string): string {
  const [y, m, d] = fixed.date.split("-").map(Number);
  const end = fixedEndTime(fixed);
  const hm = (t: string) => {
    const [hh, mm] = t.split(":").map(Number);
    return new Date(Date.UTC(2000, 0, 1, hh ?? 0, mm ?? 0));
  };
  try {
    const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)));
    const tf = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    return `${day} · ${tf.format(hm(fixed.startTime))}–${tf.format(hm(end))}`;
  } catch {
    return `${fixed.date} · ${fixed.startTime}–${end}`;
  }
}

export interface FixedScheduleFieldsProps {
  name:     string;
  value:    CartFixed | null | undefined;
  tripDays: readonly string[];
  /** 열림 상태를 부모가 쥔다 — 아이콘이 카드 액션 그룹에 있기 때문이다. */
  open:     boolean;
  onClose:  () => void;
  onOpen:   () => void;
  onChange: (next: CartFixed | null) => void;
}

export default function FixedScheduleFields({
  name, value, tripDays, open, onClose, onOpen, onChange,
}: FixedScheduleFieldsProps) {
  const t      = useTranslations("picks");
  const locale = useLocale();

  const seed = value ? toRangeDraft(value) : null;
  const [date,  setDate]  = useState(seed?.date      ?? tripDays[0] ?? "");
  const [start, setStart] = useState(seed?.startTime ?? "");
  const [end,   setEnd]   = useState(seed?.endTime   ?? "");
  const [error, setError] = useState<FixedErrorCode | null>(null);

  const noTripDates = tripDays.length === 0;

  function commit(nextDate: string, nextStart: string, nextEnd: string) {
    // 아직 다 적지 않았으면 오류를 띄우지 않는다. 입력 중인 사람을 나무라지 않는다.
    if (!nextDate || !nextStart || !nextEnd) { setError(null); return; }
    const r = validateFixedRange({ date: nextDate, startTime: nextStart, endTime: nextEnd }, tripDays);
    if (!r.ok) {
      // 잘못된 값을 저장하지도, 조용히 고치지도 않는다.
      setError(r.error);
      onChange(null);
      return;
    }
    setError(null);
    onChange(r.value);
  }

  function clear() {
    setStart(""); setEnd(""); setError(null);
    onChange(null);
    onClose();
  }

  if (!open) {
    if (!value) return null;
    return (
      <button
        type="button"
        onClick={onOpen}
        className="gkm-focus mt-2 inline-flex items-center min-h-11 text-xs font-bold text-action hover:text-action-hover"
      >
        {formatFixedSummary(value, locale)}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      {noTripDates ? (
        <p className="text-[11px] text-faint">{t("fixedNeedTripDates")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-[11px] font-bold text-sub">
              {t("timeDate")}
              <select
                value={date}
                aria-label={`${t("timeDate")}: ${name}`}
                onChange={e => { setDate(e.target.value); commit(e.target.value, start, end); }}
                className="gkm-focus mt-1 w-full min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
              >
                {tripDays.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>

            <label className="text-[11px] font-bold text-sub">
              {t("timeStart")}
              <input
                type="time"
                value={start}
                aria-label={`${t("timeStart")}: ${name}`}
                onChange={e => { setStart(e.target.value); commit(date, e.target.value, end); }}
                className="gkm-focus mt-1 w-full min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
              />
            </label>

            <label className="text-[11px] font-bold text-sub">
              {t("timeEnd")}
              <input
                type="time"
                value={end}
                aria-label={`${t("timeEnd")}: ${name}`}
                onChange={e => { setEnd(e.target.value); commit(date, start, e.target.value); }}
                className="gkm-focus mt-1 w-full min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-[11px] font-bold text-action">{t(ERROR_KEY[error])}</p>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={onClose}
              className="gkm-focus inline-flex items-center min-h-11 text-[11px] font-bold text-sub hover:text-ink">
              {t("coachGotIt")}
            </button>
            {value && (
              <button type="button" onClick={clear}
                className="gkm-focus inline-flex items-center min-h-11 text-[11px] font-bold text-faint hover:text-sub">
                {t("timeClear")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { timeToMinutes };
