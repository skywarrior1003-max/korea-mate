"use client";

// This Trip 항목 하나의 고정 일정 입력.
//
// 평소 카드는 지금처럼 단순하게 둔다. 사용자가 이 장소만은 시간이 정해져
// 있다고 켰을 때만 날짜·시작시간·소요시간이 나타난다.
//
// 장소를 다시 입력받지 않는다 — 이 카드가 곧 그 장소다.

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  validateFixedDraft, fixedEndTime, minutesToTime, timeToMinutes,
  type FixedErrorCode,
} from "@/lib/trip-fixed/fixed-core";
import type { CartFixed } from "@/lib/cart";

const ERROR_KEY: Record<FixedErrorCode, string> = {
  missingDate:       "errMissingDate",
  missingTime:       "errMissingTime",
  missingDuration:   "errMissingDuration",
  durationTooLong:   "errDurationTooLong",
  dateOutOfTrip:     "errDateOutOfTrip",
  endsPastMidnight:  "errEndsPastMidnight",
};

export interface FixedScheduleFieldsProps {
  /** 장소 이름 — 접근성 라벨에 쓴다. */
  name:      string;
  /** 이미 저장된 값. 없으면 고정되지 않은 장소다. */
  value:     CartFixed | null | undefined;
  /** 여행 날짜 목록. 비어 있으면 아직 여행 날짜가 정해지지 않았다. */
  tripDays:  readonly string[];
  onChange:  (next: CartFixed | null) => void;
}

export default function FixedScheduleFields({
  name, value, tripDays, onChange,
}: FixedScheduleFieldsProps) {
  const t = useTranslations("picks");

  const [open,     setOpen]     = useState(Boolean(value));
  const [date,     setDate]     = useState(value?.date ?? tripDays[0] ?? "");
  const [start,    setStart]    = useState(value?.startTime ?? "");
  const [duration, setDuration] = useState(value ? String(value.durationMinutes) : "");
  const [error,    setError]    = useState<FixedErrorCode | null>(null);

  const noTripDates = tripDays.length === 0;

  function commit(nextDate: string, nextStart: string, nextDuration: string) {
    const parsed = nextDuration.trim() === "" ? null : Number(nextDuration);
    const r = validateFixedDraft(
      { date: nextDate, startTime: nextStart, durationMinutes: parsed },
      tripDays,
    );
    if (!r.ok) {
      // 잘못된 값을 조용히 버리고 평범한 장소로 두지 않는다. 저장도 하지 않는다.
      setError(r.error);
      onChange(null);
      return;
    }
    setError(null);
    onChange(r.value);
  }

  function toggle(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      onChange(null);
    } else {
      commit(date, start, duration);
    }
  }

  const preview = (() => {
    if (!open || error) return null;
    const d = Number(duration);
    if (!start || !Number.isFinite(d) || d <= 0) return null;
    const end = timeToMinutes(start);
    if (Number.isNaN(end)) return null;
    return minutesToTime(end + d);
  })();

  return (
    <div className="mt-3 border-t border-line pt-3">
      <label className="flex items-center gap-2 text-xs font-bold text-sub">
        <input
          type="checkbox"
          checked={open}
          disabled={noTripDates}
          onChange={e => toggle(e.target.checked)}
          aria-label={`${t("fixedToggle")}: ${name}`}
          className="gkm-focus h-4 w-4 accent-action"
        />
        {t("fixedToggle")}
      </label>

      {noTripDates ? (
        <p className="mt-1 text-[11px] text-faint">{t("fixedNeedTripDates")}</p>
      ) : !open ? (
        <p className="mt-1 text-[11px] text-faint">{t("fixedHint")}</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-bold text-sub">
            {t("fixedDate")}
            <select
              value={date}
              onChange={e => { setDate(e.target.value); commit(e.target.value, start, duration); }}
              className="gkm-focus mt-1 w-full min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
            >
              {tripDays.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>

          <label className="text-[11px] font-bold text-sub">
            {t("fixedStart")}
            <input
              type="time"
              value={start}
              onChange={e => { setStart(e.target.value); commit(date, e.target.value, duration); }}
              className="gkm-focus mt-1 w-full min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
            />
          </label>

          <label className="text-[11px] font-bold text-sub">
            {t("fixedDuration")}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={720}
              step={5}
              value={duration}
              onChange={e => { setDuration(e.target.value); commit(date, start, e.target.value); }}
              className="gkm-focus mt-1 w-full min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
            />
          </label>
        </div>
      )}

      {open && error && (
        <p role="alert" className="mt-2 text-[11px] font-bold text-action">
          {t(ERROR_KEY[error])}
        </p>
      )}
      {preview && (
        <p className="mt-2 text-[11px] text-faint">{t("fixedEnds", { time: preview })}</p>
      )}
    </div>
  );
}

/** 저장된 값에서 종료시각 문구를 만들 때 쓰는 재수출. */
export { fixedEndTime };
