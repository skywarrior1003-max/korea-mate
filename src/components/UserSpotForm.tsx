// 사용자 등록 장소(user_spots) 입력 폼 — UserSpotsPanel 과 Picks > My Places 공용.
//
// 원래 UserSpotsPanel.renderForm 안에 있던 JSX 를 그대로 옮긴 것이다. 같은 폼을
// 두 화면에서 쓰게 되면서 로직을 복제하면 검증 규칙이 갈라진다 — 한 곳만 고치고
// 다른 곳을 잊는 종류의 버그다. 마크업·maxLength·필수값 규칙을 한 파일에 둔다.
//
// 상태는 호출부가 소유한다(controlled). 생성·수정 모두 같은 폼을 쓰는데 저장
// 동작과 낙관적 갱신 방식이 서로 다르기 때문이다.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { canCreate, canEdit, hasUsableName } from "@/lib/user-spots/anchor-core";
import {
  chooseSeed, classifyPlaceLink, isShortMapLink, parseMapLinkCoordinate,
  type SeedCoordinate, type SeedSource,
} from "@/lib/user-spots/location-seed";
import { readPhotoExif, exifConflict, type PhotoExif } from "@/lib/photo-exif";
import type { UserSpotPhoto } from "@/lib/user-spots-api";
import { geocodeAddress } from "@/lib/maps/naver-geocode";
import { CITY_ARRIVAL_OPTIONS } from "@/data/city-presets";
import SpotLocationPicker from "./SpotLocationPicker";

// 값(value)은 저장되는 데이터라 그대로 두고, 화면에 찍는 라벨만 키로 바꾼다.
export const USER_SPOT_CATEGORIES = [
  { value: "attraction",     labelKey: "catAttraction"    },
  { value: "nature",         labelKey: "catNature"        },
  { value: "restaurant",     labelKey: "catRestaurant"    },
  { value: "event",          labelKey: "catEvent"         },
  { value: "accommodation",  labelKey: "catAccommodation" },
] as const;

export type UserSpotCategory = typeof USER_SPOT_CATEGORIES[number]["value"];
export type UserSpotCategoryLabelKey = typeof USER_SPOT_CATEGORIES[number]["labelKey"];

/**
 * 저장된 category value 를 화면 라벨 키로 바꾼다.
 *
 * DB 에 들어 있는 값은 그대로 두고 보여줄 때만 번역한다. 폼의 select 와
 * 목록 카드가 같은 키를 쓰게 하려고 여기 둔다 — 두 곳이 갈라지면 폼에서는
 * "명소" 인데 목록에서는 "attraction" 인 상태가 다시 생긴다.
 *
 * 아는 값이 아니면 null 을 준다. 호출부는 원본 값을 그대로 보여준다 —
 * 모르는 값을 감추면 사용자는 자기 데이터가 사라진 것처럼 본다.
 */
export function userSpotCategoryLabelKey(
  value: string | null | undefined,
): UserSpotCategoryLabelKey | null {
  const v = (value ?? "").trim();
  return USER_SPOT_CATEGORIES.find(c => c.value === v)?.labelKey ?? null;
}

export interface UserSpotFormState {
  name:     string;
  /** 나만 보는 제목. factual name 과 다른 값이다. 편집 화면에서만 다룬다. */
  displayTitle: string;
  /** 나만 보는 기록. 공개로 나갈 수 있는 note 와 다른 값이다. */
  displayMemo:  string;
  category: UserSpotCategory;
  address:  string;
  note:     string;
  /** 위치 확인 지도에서 사용자가 맞춘 중심. 좌표는 언제나 짝으로 움직인다. */
  lat:      number | null;
  lng:      number | null;
}

export const EMPTY_USER_SPOT_FORM: UserSpotFormState = {
  name: "", displayTitle: "", displayMemo: "",
  category: "attraction", address: "", note: "", lat: null, lng: null,
};

interface Props {
  form:        UserSpotFormState;
  setForm:     React.Dispatch<React.SetStateAction<UserSpotFormState>>;
  formError:   string | null;
  submitting:  boolean;
  submitLabel: string;
  onSubmit:    (e: React.FormEvent) => Promise<void>;
  onCancel:    () => void;

  // ── 사진 ────────────────────────────────────────────────────────────────────
  /** 새로 만드는 중인지 고치는 중인지. 저장 가능 조건이 다르다. */
  mode:             "create" | "edit";
  /**
   * 지금 보고 있는 도시. 주소도 링크도 현재 위치도 없을 때 지도를 열 자리다.
   * 없으면 지도는 그대로 열리고 사용자가 찾아간다 — 없다고 막지 않는다.
   */
  city?:            string | null;
  /** 이번에 고른 파일. 폼은 파일 자체만 들고 있고 바이트를 복제하지 않는다. */
  photoFile:        File | null;
  onPickPhoto:      (file: File | null) => void;
  /** 이미 저장된 사진의 만료되는 URL. 없으면 null. */
  existingPhotoUrl?: string | null;
  hasExistingPhoto?: boolean;
  /** 저장된 사진 삭제. 서버가 409 로 막을 수 있어 호출부가 결과를 처리한다. */
  onRemoveExistingPhoto?: () => void;
  /** 사진 관련 진행 중 상태 (압축·업로드·삭제) */
  photoBusy?:       boolean;
  /** 사진 관련 안내·오류 문구 */
  photoNotice?:     string | null;
  /**
   * 개인 사진이 없을 때만 쓰는 공개 장소 대표 이미지.
   * 개인 사진이 있으면 서버가 주지 않는다 — 내가 찍은 사진 위에 덮이지 않는다.
   */
  canonicalImageUrl?:  string | null;
  /** 표기가 필요한 이미지일 때의 출처 링크. 없으면 표기할 것이 없다는 뜻이다. */
  canonicalSourceUrl?: string | null;

  // ── 사진 여러 장(최대 3장) — 주면 위 한 장 입력 대신 이것을 쓴다 ─────────────
  multiPhoto?: MultiPhotoProps;
  /** 사진 촬영 시각을 쓰기로 했을 때(또는 지웠을 때). 위치와 별개다. */
  onUsePhotoTime?: (v: { date: string; time: string } | null) => void;
  /** 지금 쓰기로 한 촬영 시각 — 편집할 수 있게 다시 보여 준다. */
  photoTime?: { date: string; time: string } | null;
}

export interface MultiPhotoProps {
  /** 새로 고른 파일(아직 올리지 않음). 순서 = 저장 순서, 첫 장이 대표. */
  files:     File[];
  setFiles:  (f: File[]) => void;
  /** 이미 저장된 사진(고치는 중일 때). 주면 새 사진은 고르는 즉시 올린다. */
  stored?:   UserSpotPhoto[];
  onStoredAdd?:    (files: File[]) => void;
  onStoredRemove?: (key: string) => void;
  onStoredMove?:   (key: string, dir: -1 | 1) => void;
}

const PHOTO_MAX = 3;

const INPUT =
  "mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EA] text-sm font-medium text-[#191C21] bg-white focus:outline-none focus:border-[#FF4A2D] focus:ring-1 focus:ring-[#FF4A2D]";
const LABEL = "text-xs font-black text-[#565D66] uppercase tracking-wider";
const CHIP_BTN =
  "gkm-focus px-3 min-h-11 py-2 rounded-xl text-xs font-bold border border-[#E5E7EA] text-[#565D66] hover:bg-[#F6F7F8] transition-colors disabled:opacity-60 cursor-pointer";

type GpsState = "idle" | "loading" | "denied" | "failed";

export default function UserSpotForm({
  form, setForm, formError, submitting, submitLabel, onSubmit, onCancel,
  mode, city = null, photoFile, onPickPhoto,
  existingPhotoUrl = null, hasExistingPhoto = false,
  onRemoveExistingPhoto, photoBusy = false, photoNotice = null,
  canonicalImageUrl = null, canonicalSourceUrl = null,
  multiPhoto, onUsePhotoTime, photoTime = null,
}: Props) {
  const t = useTranslations("picks");
  const [gps, setGps] = useState<GpsState>("idle");
  /**
   * 좌표가 어디서 왔는지 — 화면에 그대로 말해 준다. 촬영 위치는 카메라가 있던 자리라
   * 가게 주소와 다를 수 있고, 지금 휴대폰 위치와도 다르다.
   */
  const [locSource, setLocSource] = useState<null | "map" | "link" | "photo">(null);
  /** 사진 촬영 정보(EXIF) — 파일마다. 원본 File 에서 업로드 전에 읽는다. */
  const [exifs, setExifs] = useState<Map<File, PhotoExif>>(new Map());
  const [exifDismissed, setExifDismissed] = useState(false);
  /** 촬영 정보가 사진마다 다를 때 어느 사진 기준인지(1부터). */
  const [exifPick, setExifPick] = useState(1);
  /** 지도를 끝내 못 띄워 "위치 없이 진행" 을 고른 상태. */
  const [noLocationChosen, setNoLocationChosen] = useState(false);

  // 위치 확인 화면. 지도를 열기 전에 어디서 열지부터 정한다.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seeking,    setSeeking]    = useState(false);
  /**
   * 붙여넣은 지도 링크. 폼 상태(`form`)에 넣지 않는다 — 넣으면 부모가 저장
   * payload 에 실어 보내고, 링크가 장소의 영구 데이터가 되어 버린다. 이 값은
   * 지도를 어디서 열지 정하는 데만 쓰고 저장하지 않는다.
   */
  const [mapLink, setMapLink] = useState("");
  const [seed, setSeed] = useState<
    { coordinate: SeedCoordinate | null; source: SeedSource; short: boolean; hadAlready: boolean } | null
  >(null);

  // 고른 파일의 미리보기. Object URL 은 만든 쪽이 반드시 되돌려줘야 한다 —
  // 안 하면 탭을 닫을 때까지 그 이미지가 메모리에 남는다.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photoFile) { setLocalPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // 고치는 중에는 사진을 고르는 즉시 올리므로, 촬영 정보는 방금 고른 파일에서 읽는다.
  const [recentPicked, setRecentPicked] = useState<File[]>([]);
  // 새로 고른 사진의 촬영 정보를 읽는다(한 번씩). 없으면 빈 값 — 저장은 그대로 된다.
  const pickedFiles = multiPhoto
    ? (multiPhoto.stored ? recentPicked : multiPhoto.files)
    : (photoFile ? [photoFile] : []);
  const pickedSig = pickedFiles.map(f => `${f.name}:${f.size}:${f.lastModified}`).join("|");
  useEffect(() => {
    const todo = pickedFiles.filter(f => !exifs.has(f));
    if (todo.length === 0) return;
    let alive = true;
    void Promise.all(todo.map(async f => [f, await readPhotoExif(f)] as const)).then(rs => {
      if (!alive) return;
      setExifs(prev => { const m = new Map(prev); rs.forEach(([f, e]) => m.set(f, e)); return m; });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSig]);

  /** 지도를 여는 순간에만 권한을 묻는다. 거절해도 지도는 열린다. */
  function currentPosition(): Promise<SeedCoordinate | null> {
    if (!navigator.geolocation) { setGps("failed"); return Promise.resolve(null); }
    setGps("loading");
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => { setGps("idle"); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        err => { setGps(err.code === err.PERMISSION_DENIED ? "denied" : "failed"); resolve(null); },
        { timeout: 8_000, maximumAge: 60_000, enableHighAccuracy: false },
      );
    });
  }

  /** 이 도시의 첫 프리셋 지점. 새 좌표표를 만들지 않고 화면이 이미 쓰는 값을 쓴다. */
  function cityCenter(): SeedCoordinate | null {
    const first = CITY_ARRIVAL_OPTIONS[(city ?? "").trim()]?.[0];
    return first ? { lat: first.lat, lng: first.lng } : null;
  }

  /**
   * 지도를 어디서 열지 정하고 연다.
   *
   * 주소 칸 하나가 두 가지를 받는다 — 사람이 읽는 주소, 그리고 지도 링크.
   * 링크에 좌표가 박혀 있으면 그게 가장 정확하고, 아니면 주소를 찾아본다.
   * 둘 다 안 되면 지금 서 있는 자리, 그것도 안 되면 도시 중심이다.
   * 어디서 열든 최종 좌표는 사용자가 확인한 지도 중심이다.
   */
  async function openPicker() {
    setSeeking(true);
    const raw   = form.address.trim();
    // 붙여넣은 링크가 먼저다. 사람이 방금 준 지시라서, 예전에 확인해 둔 자리보다
    // 이쪽을 믿는다 — 링크를 새로 넣고 "다시 확인" 을 누르는 사람은 그 자리로
    // 옮기려는 것이다. 주소 칸도 예전처럼 링크를 받아 준다(그쪽은 저장된다).
    const pasted     = mapLink.trim();
    const pastedShort = isShortMapLink(pasted);
    const pastedLink  = pasted && !pastedShort ? parseMapLinkCoordinate(pasted) : null;

    const short = pastedShort || (!pasted && isShortMapLink(raw));
    const link  = pastedLink ?? (short ? null : parseMapLinkCoordinate(raw));

    // 링크로 이미 찾았으면 주소를 다시 묻지 않는다. 링크처럼 생긴 문자열을
    // geocoder 에 넘기면 엉뚱한 곳이 나온다.
    const looksLikeUrl = /^https?:\/\//i.test(raw) || short;
    const address = !link && raw && !looksLikeUrl ? await geocodeAddress(raw) : null;

    // 이미 확인해 둔 좌표가 있으면 그 자리에서 다시 연다.
    const already = form.lat !== null && form.lng !== null
      ? { lat: form.lat, lng: form.lng }
      : null;

    let picked = pastedLink
      ? { coordinate: pastedLink, source: "link" as SeedSource }
      : already
        ? { coordinate: already, source: "link" as SeedSource }
        : chooseSeed({ link, address });

    if (!picked.coordinate) {
      const gps = await currentPosition();
      picked = chooseSeed({ gps, city: cityCenter() });
    }

    setSeed({ ...picked, short, hadAlready: already !== null && !pastedLink });
    setSeeking(false);
    setPickerOpen(true);
  }

  const hasLocation = form.lat !== null && form.lng !== null;
  const linkStatus  = classifyPlaceLink(mapLink);

  // 촬영 정보 제안 — 사진 순서대로(1번이 대표). 사진마다 다르면 어느 사진 기준인지 고른다.
  const exifRows = pickedFiles
    .map((f, i) => ({ n: i + 1, e: exifs.get(f) ?? null }))
    .filter((r): r is { n: number; e: PhotoExif } => !!r.e && (!!r.e.date || r.e.lat !== null));
  const conflict   = exifConflict(exifRows.map(r => r.e));
  const exifChosen = exifRows.find(r => r.n === exifPick) ?? exifRows[0] ?? null;
  const showExif   = !exifDismissed && exifChosen !== null;
  const shownPhoto  = localPreview ?? existingPhotoUrl;
  // 내 사진이 하나도 없을 때만 장소 사진을 보여준다. 순서를 바꾸면 내가 찍은
  // 사진 대신 카탈로그 사진이 뜬다 — 그건 내 기록이 아니다.
  const shownCanonical = !shownPhoto ? canonicalImageUrl : null;

  // 저장할 수 있는가 — 이름은 여기에 영향을 주지 않는다.
  //
  // 새로 만들 때는 지도에서 확인한 좌표 하나만 본다. 예전에는 `canCreate` 를
  // 그대로 써서 "좌표 또는 사진" 이었고, 사진만 붙이면 지도를 한 번도 열지
  // 않고 좌표 없는 장소가 만들어졌다. 그 장소는 일정에 넣을 수 없다 —
  // 사진은 무엇을 봤는지 알려 주지만 어디였는지는 알려 주지 않는다.
  //
  // 고칠 때는 규칙이 다르다. 이름만으로 만들어진 예전 행이 남아 있고 그
  // 메모를 고치려는 사람을 막을 이유가 없다 — `canEdit` 를 그대로 둔다.
  //
  // 2026-10-01 — 만들기도 "위치 미정" 을 받는다(Owner 결정). 지도가 열리지 않는
  // 환경(지도 인증 실패)에서 저장 자체가 막혀 장소를 잃던 결함 때문이다. 좌표는
  // 여전히 지어내지 않는다: 확인한 좌표 · 사진 · 이름(2자 이상) 중 하나면 저장한다.
  const anyPhoto = multiPhoto
    ? (multiPhoto.files.length + (multiPhoto.stored?.length ?? 0)) > 0
    : photoFile !== null;
  const anchorInput = { lat: form.lat, lng: form.lng, hasPhoto: anyPhoto };
  const canSubmit = mode === "create"
    ? canCreate({ ...anchorInput, name: form.name })
    : canEdit({ ...anchorInput, name: form.name, hasExistingPhoto });
  // 저장할 수 없는 이유 — 지금 무엇이 빠졌는지에 맞춰 말한다.
  const blockedReason = canSubmit ? null
    : mode === "create"
      ? (form.name.trim().length === 1 ? t("needNameLonger") : t("needAnythingCreate"))
      : t("needAnchor");

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 mt-3">
      {multiPhoto ? (
        <PhotoSlots
          multi={multiPhoto}
          busy={photoBusy || submitting}
          notice={photoNotice}
          onPicked={fs => setRecentPicked(fs)}
        />
      ) : (
      /* Photo — 위치와 함께 이 장소를 아는 근거가 된다. 사진만으로도 저장된다. */
      <div>
        <label className={LABEL}>
          {t("fieldPhoto")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>

        {shownPhoto && (
          <div className="mt-1 relative w-full max-w-[280px] aspect-[4/3] rounded-xl overflow-hidden bg-[#F6F7F8] border border-[#E5E7EA]">
            {/* 만료되는 URL 이라 next/image 최적화 대상이 아니다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shownPhoto}
              alt={t("photoAlt")}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <label className={`${CHIP_BTN} inline-flex items-center ${photoBusy ? "opacity-60 pointer-events-none" : ""}`}>
            {shownPhoto ? t("photoChange") : t("photoAdd")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy || submitting}
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                onPickPhoto(f);
                // 같은 파일을 다시 골라도 change 가 나도록 비운다.
                e.target.value = "";
              }}
            />
          </label>

          {photoFile && (
            <button
              type="button"
              onClick={() => onPickPhoto(null)}
              disabled={photoBusy || submitting}
              className={CHIP_BTN}
            >
              {t("photoRemove")}
            </button>
          )}

          {/* 저장된 사진 삭제는 서버 호출이라 고르기 취소와 다른 동작이다. */}
          {!photoFile && hasExistingPhoto && onRemoveExistingPhoto && (
            <button
              type="button"
              onClick={onRemoveExistingPhoto}
              disabled={photoBusy || submitting}
              className={CHIP_BTN}
            >
              {t("photoRemove")}
            </button>
          )}
        </div>

        {/* 장소 사진 fallback — 내 사진이 없을 때만 */}
        {shownCanonical && (
          <div className="mt-1">
            <div className="relative w-full max-w-[280px] aspect-[4/3] rounded-xl overflow-hidden bg-[#F6F7F8] border border-[#E5E7EA]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shownCanonical} alt={t("canonicalPhotoAlt")} className="w-full h-full object-cover" />
            </div>
            <p className="mt-1 text-[11px] text-[#565D66]/70">
              {t("canonicalPhotoNote")}
              {canonicalSourceUrl && (
                <>
                  {" · "}
                  <a
                    href={canonicalSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >{t("photoSource")}</a>
                </>
              )}
            </p>
          </div>
        )}

        {photoNotice && (
          <p role="status" className="mt-1 text-[11px] text-[#565D66]">{photoNotice}</p>
        )}
      </div>
      )}

      {/* 사진 촬영 정보 제안 — 자동으로 넣지 않는다. 사용자가 고른 것만 쓴다. */}
      {showExif && exifChosen && (
        <div className="rounded-xl border border-[#E5E7EA] bg-[#F6F7F8] p-3 space-y-2" data-testid="exif-suggest">
          <p className="text-xs font-black text-[#191C21]">{t("exifAsk")}</p>
          {(conflict.time || conflict.place) && exifRows.length > 1 && (
            <div className="text-[11px] text-[#565D66]" data-testid="exif-conflict">
              <p>{t("exifConflict")}</p>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                {exifRows.map(r => (
                  <button
                    key={r.n} type="button" onClick={() => setExifPick(r.n)}
                    aria-pressed={exifChosen.n === r.n}
                    className={`${CHIP_BTN} ${exifChosen.n === r.n ? "!border-[#191C21] !text-[#191C21]" : ""}`}
                  >{t("exifPhotoN", { n: r.n })}</button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-[#565D66]" data-testid="exif-basis">{t("exifBasis", { n: exifChosen.n })}</p>
          {exifChosen.e.date && exifChosen.e.time && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#191C21]">{t("exifTime", { date: exifChosen.e.date, time: exifChosen.e.time })}</span>
              {onUsePhotoTime && (
                <button
                  type="button" className={CHIP_BTN}
                  onClick={() => onUsePhotoTime({ date: exifChosen.e.date as string, time: exifChosen.e.time as string })}
                >{t("exifUseTime")}</button>
              )}
            </div>
          )}
          {exifChosen.e.lat !== null && exifChosen.e.lng !== null && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[#191C21]">{t("exifPlace")}</span>
                <button
                  type="button" className={CHIP_BTN}
                  onClick={() => {
                    setForm(p => ({ ...p, lat: exifChosen.e.lat, lng: exifChosen.e.lng }));
                    setLocSource("photo");
                    setNoLocationChosen(false);
                  }}
                >{t("exifUsePlace")}</button>
              </div>
              <p className="text-[11px] text-[#565D66]/80">{t("exifPlaceNote")}</p>
            </div>
          )}
          <button
            type="button" className="text-[11px] font-bold text-[#565D66] underline cursor-pointer"
            onClick={() => setExifDismissed(true)}
          >{t("exifIgnore")}</button>
        </div>
      )}

      {/* 쓰기로 한 촬영 시각 — 고칠 수 있다. My Trip 을 시작할 때 기본값이 된다. */}
      {photoTime && onUsePhotoTime && (
        <div className="flex items-center gap-2 flex-wrap text-xs" data-testid="photo-time">
          <span className="font-bold text-[#565D66]">{t("visitTimeLabel")}</span>
          <input
            type="date" value={photoTime.date} aria-label={t("visitTimeLabel")}
            className="px-2 py-1 rounded-lg border border-[#E5E7EA]"
            onChange={e => { if (e.target.value) onUsePhotoTime({ ...photoTime, date: e.target.value }); }}
          />
          <input
            type="time" value={photoTime.time} aria-label={t("visitTimeLabel")}
            className="px-2 py-1 rounded-lg border border-[#E5E7EA]"
            onChange={e => { if (e.target.value) onUsePhotoTime({ ...photoTime, time: e.target.value }); }}
          />
          <button
            type="button" className="text-[11px] underline text-[#565D66] cursor-pointer"
            onClick={() => onUsePhotoTime(null)}
          >{t("visitTimeClear")}</button>
        </div>
      )}

      {/* Location — 지도에서 이 장소의 자리를 짚는다.
          예전에는 "지금 내가 서 있는 곳" 만 줄 수 있었다. 그건 이 장소의 위치가
          아니라 내 위치다 — 집에서 카페를 등록하면 집 좌표가 저장됐다.
          이제 그 값은 지도를 열 자리로만 쓰고, 저장되는 것은 사용자가 확인한 중심이다. */}
      {/* 장소 링크 — 지도를 어디서 열지 정하는 보조 입력이다. 저장하지 않는다.
          이 기능은 원래도 있었지만 주소 칸에 숨어 있어서, 링크를 넣어도 된다는
          것을 화면만 보고는 알 수 없었다. 자리를 따로 내주었다. */}
      <div>
        <label className={LABEL}>
          {t("fieldPlaceLink")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>
        <input
          type="url"
          inputMode="url"
          value={mapLink}
          onChange={e => setMapLink(e.target.value)}
          maxLength={500}
          placeholder={t("phPlaceLink")}
          className={INPUT}
        />
        {linkStatus.kind === "empty" ? (
          <p className="mt-1 text-[11px] text-[#565D66]/70">{t("placeLinkHint")}</p>
        ) : (
          <div className="mt-1 space-y-1" role="status" data-testid="link-status" data-kind={linkStatus.kind}>
            <p className={`text-[11px] ${linkStatus.kind === "coords" ? "text-[#0B6B3A] font-bold" : "text-[#565D66]"}`}>
              {linkStatus.kind === "coords" && linkStatus.coordinate
                ? t("linkFound", { lat: linkStatus.coordinate.lat.toFixed(5), lng: linkStatus.coordinate.lng.toFixed(5) })
                : t(linkStatus.kind === "short" ? "linkShort"
                  : linkStatus.kind === "map" ? "linkMapNoCoords"
                  : linkStatus.kind === "reference" ? "linkReference" : "linkInvalid")}
            </p>
            {linkStatus.kind === "coords" && linkStatus.coordinate && (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button" className={CHIP_BTN}
                  onClick={() => {
                    const c = linkStatus.coordinate as SeedCoordinate;
                    setForm(p => ({ ...p, lat: c.lat, lng: c.lng }));
                    setLocSource("link");
                    setNoLocationChosen(false);
                  }}
                >{t("linkUseCoords")}</button>
                <button type="button" className={CHIP_BTN} onClick={() => void openPicker()} disabled={seeking}>
                  {t("linkCheckOnMap")}
                </button>
              </div>
            )}
            {linkStatus.kind !== "coords" && (
              <p className="text-[11px] text-[#565D66]/70">{t("linkSupported")}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className={LABEL}>
          {t("fieldLocation")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        </label>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {hasLocation ? (
            <>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F6F7F8] text-sm font-bold text-[#191C21]"
                data-testid="loc-state" data-source={locSource ?? "map"}
              >
                ✓ {t(locSource === "link" ? "locFromLink" : locSource === "photo" ? "locFromPhoto" : "locConfirmed")}
              </span>
              {/* 지우기는 두지 않는다. 자리를 잘못 짚었으면 다시 확인으로 옮기면
                  되고, 지워 두면 저장할 수 없는 상태로 되돌아갈 뿐이다. */}
              <button type="button" onClick={() => void openPicker()} disabled={seeking} className={CHIP_BTN}>
                {t("locRecheck")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void openPicker()}
              disabled={seeking}
              className="gkm-focus px-4 min-h-11 py-2 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: "#0057ff" }}
            >
              {seeking ? t("locSeeking") : t("locConfirmOpen")}
            </button>
          )}
        </div>
        {!hasLocation && gps === "idle" && (
          <p className="mt-1 text-[11px] text-[#565D66]/70">{t("locConfirmWhy")}</p>
        )}
        {/* 위치 없이도 저장된다 — 무엇을 못 쓰게 되는지 미리 말해 준다 */}
        {!hasLocation && (
          <p className="mt-1 text-[11px] font-bold text-[#8A5A00]" data-testid="loc-unknown-note">
            {t(noLocationChosen ? "locUnknownChosen" : "locUnknownNote")}
          </p>
        )}
        {hasLocation && locSource === "photo" && (
          <p className="mt-1 text-[11px] text-[#565D66]/80">{t("exifPlaceNote")}</p>
        )}
        {gps === "denied" && (
          <p className="mt-1 text-[11px] text-[#565D66]">{t("locationDenied")}</p>
        )}
        {gps === "failed" && (
          <p className="mt-1 text-[11px] text-[#565D66]">{t("locationFailed")}</p>
        )}
      </div>

      {pickerOpen && (
        <SpotLocationPicker
          center={seed?.coordinate ?? null}
          zoomedIn={seed?.hadAlready ?? false}
          placeName={form.name}
          seedNote={
            seed?.short              ? t("locSeedShortLink")
            : seed?.source === "link"    ? (seed.hadAlready ? null : t("locSeedLink"))
            : seed?.source === "address" ? t("locSeedAddress")
            : seed?.source === "gps"     ? t("locSeedGps")
            : seed?.source === "city"    ? t("locSeedCity")
            : t("locSeedNone")
          }
          onCancel={() => setPickerOpen(false)}
          onConfirm={(lat, lng) => {
            setForm(p => ({ ...p, lat, lng }));
            // 지도를 못 띄워 "링크 좌표로 저장" 을 고른 경우도 여기로 온다
            const lc = linkStatus.coordinate;
            setLocSource(lc && Math.abs(lc.lat - lat) < 1e-9 && Math.abs(lc.lng - lng) < 1e-9 ? "link" : "map");
            setNoLocationChosen(false);
            setPickerOpen(false);
          }}
          linkCoordinate={linkStatus.kind === "coords" ? linkStatus.coordinate : null}
          onNoLocation={() => { setNoLocationChosen(true); setPickerOpen(false); }}
        />
      )}

      {/* Name — 손으로 적는 것은 선택이다. 저장 여부에는 영향을 주지 않는다.
          2026-10-01 — 위치·사진이 없을 때는 이름(2자 이상)이 "위치 미정" 저장의 근거가 된다. */}
      <div>
        <label className={LABEL}>
          {t("fieldName")}{" "}
          <span className="font-normal normal-case text-[#565D66]/60">
            {!hasLocation && !anyPhoto && !hasUsableName(form.name) ? t("nameNeededSuffix") : t("optionalSuffix")}
          </span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          maxLength={300}
          placeholder={t("phName")}
          className={INPUT}
        />
      </div>

      {/* 나만 보는 값 — 만들 때는 묻지 않는다. 저장을 복잡하게 만들지 않는다. */}
      {mode === "edit" && (
        <>
          <div>
            <label className={LABEL}>
              {t("fieldDisplayTitle")}{" "}
              <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
            </label>
            <input
              type="text"
              value={form.displayTitle}
              onChange={e => setForm(p => ({ ...p, displayTitle: e.target.value }))}
              maxLength={300}
              placeholder={t("phDisplayTitle")}
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-[#565D66]/70">{t("displayVsName")}</p>
          </div>

          <div>
            <label className={LABEL}>
              {t("fieldDisplayMemo")}{" "}
              <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
            </label>
            <textarea
              value={form.displayMemo}
              onChange={e => setForm(p => ({ ...p, displayMemo: e.target.value }))}
              maxLength={1000}
              rows={2}
              placeholder={t("phDisplayMemo")}
              className={`${INPUT} resize-none`}
            />
            <p className="mt-1 text-[11px] text-[#565D66]/70">{t("displayVsNote")}</p>
          </div>
        </>
      )}

      {/* Category */}
      <div>
        <label className={LABEL}>{t("fieldCategory")}</label>
        <select
          value={form.category}
          onChange={e => setForm(p => ({ ...p, category: e.target.value as UserSpotCategory }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EA] text-sm font-medium text-[#191C21] bg-white focus:outline-none focus:border-[#FF4A2D]"
        >
          {USER_SPOT_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Address */}
      <div>
        <label className={LABEL}>{t("fieldAddress")} <span className="font-normal normal-case text-[#565D66]/60">{t("optional")}</span></label>
        <input
          type="text"
          value={form.address}
          onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
          maxLength={500}
          placeholder={t("phAddress")}
          className={INPUT}
        />
      </div>

      {/* Note */}
      <div>
        <label className={LABEL}>{t("fieldNote")} <span className="font-normal normal-case text-[#565D66]/60">{t("optional")}</span></label>
        <textarea
          value={form.note}
          onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
          maxLength={2000}
          rows={2}
          placeholder={t("phNote")}
          className={`${INPUT} resize-none`}
        />
      </div>

      {formError && (
        <p role="alert" className="text-xs text-red-500 font-medium">{formError}</p>
      )}

      {/* 저장할 수 없는 이유를 버튼이 비활성인 채로 두지 않고 말해 준다.
          만들 때와 고칠 때 막히는 이유가 다르므로 다른 말을 한다. */}
      {!canSubmit && !formError && (
        <p className="text-[11px] font-bold text-[#565D66]" data-testid="save-blocked-reason">{blockedReason}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting || photoBusy || !canSubmit}
          aria-describedby={!canSubmit ? "gkm-anchor-hint" : undefined}
          className="gkm-focus flex-1 min-h-11 py-2.5 rounded-xl text-sm font-black text-white transition-opacity disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: "#FF4A2D" }}
        >
          {submitting ? t("saving") : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="gkm-focus px-4 min-h-11 py-2.5 rounded-xl text-sm font-bold border border-[#E5E7EA] text-[#565D66] hover:bg-[#F6F7F8] transition-colors cursor-pointer"
        >
          {t("cancel")}
        </button>
      </div>
      {!canSubmit && (
        <span id="gkm-anchor-hint" className="sr-only">{blockedReason}</span>
      )}
    </form>
  );
}

/**
 * 사진 최대 3장 — 추가·빼기·순서 바꾸기, "n/3장". 1번이 대표 사진이다(목록 카드·
 * 여행 기록의 첫 장). 새로 만드는 중이면 저장할 때 올라가고, 고치는 중(stored 있음)
 * 이면 누르는 즉시 서버에 반영된다.
 */
function PhotoSlots({ multi, busy, notice, onPicked }: {
  multi: MultiPhotoProps; busy: boolean; notice: string | null; onPicked: (files: File[]) => void;
}) {
  const t = useTranslations("picks");
  const stored = multi.stored ?? [];
  const total  = stored.length + multi.files.length;
  // 미리보기 Object URL — 파일 목록이 바뀌거나 사라질 때 반드시 되돌려준다.
  const previews = useMemo(() => multi.files.map(f => URL.createObjectURL(f)), [multi.files]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const moveFile = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= multi.files.length) return;
    const next = [...multi.files];
    [next[i], next[j]] = [next[j], next[i]];
    multi.setFiles(next);
  };

  type Tile = { key: string; src: string | null; main: boolean; onRemove: () => void; onLeft?: () => void; onRight?: () => void };
  const tiles: Tile[] = [
    ...stored.map((p, i): Tile => ({
      key: `s-${p.key}`, src: p.url, main: i === 0,
      onRemove: () => multi.onStoredRemove?.(p.key),
      onLeft:  i > 0 ? () => multi.onStoredMove?.(p.key, -1) : undefined,
      onRight: i < stored.length - 1 ? () => multi.onStoredMove?.(p.key, 1) : undefined,
    })),
    ...multi.files.map((f, i): Tile => ({
      key: `f-${i}-${f.name}-${f.size}`, src: previews[i] ?? null, main: stored.length === 0 && i === 0,
      onRemove: () => multi.setFiles(multi.files.filter((_, k) => k !== i)),
      onLeft:  i > 0 ? () => moveFile(i, -1) : undefined,
      onRight: i < multi.files.length - 1 ? () => moveFile(i, 1) : undefined,
    })),
  ];

  return (
    <div data-testid="photo-slots" data-count={total}>
      <label className={LABEL}>
        {t("fieldPhoto")}{" "}
        <span className="font-normal normal-case text-[#565D66]/60">{t("optionalSuffix")}</span>
        <span className="ml-2 font-black normal-case text-[#191C21]" data-testid="photo-count">
          {t("photoCount", { n: total, max: PHOTO_MAX })}
        </span>
      </label>
      <div className="mt-1 grid grid-cols-3 gap-2 max-w-[360px]">
        {tiles.map((tile, idx) => (
          <div key={tile.key} className="relative aspect-square rounded-xl overflow-hidden bg-[#F6F7F8] border border-[#E5E7EA]" data-testid="photo-tile">
            {tile.src && (
              // 만료되는 URL·Object URL 이라 next/image 최적화 대상이 아니다.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tile.src} alt={t("photoAltN", { n: idx + 1 })} className="w-full h-full object-cover" />
            )}
            {tile.main && (
              <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{t("photoMain")}</span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 px-1">
              <button
                type="button" disabled={busy || !tile.onLeft} onClick={tile.onLeft}
                aria-label={t("photoMoveLeft", { n: idx + 1 })}
                className="min-w-8 min-h-8 text-white text-sm font-black disabled:opacity-30 cursor-pointer"
              >‹</button>
              <button
                type="button" disabled={busy} onClick={tile.onRemove}
                aria-label={t("photoRemoveN", { n: idx + 1 })}
                className="min-w-8 min-h-8 text-white text-sm font-black disabled:opacity-30 cursor-pointer"
              >✕</button>
              <button
                type="button" disabled={busy || !tile.onRight} onClick={tile.onRight}
                aria-label={t("photoMoveRight", { n: idx + 1 })}
                className="min-w-8 min-h-8 text-white text-sm font-black disabled:opacity-30 cursor-pointer"
              >›</button>
            </div>
          </div>
        ))}
        {total < PHOTO_MAX && (
          <label className={`aspect-square rounded-xl border border-dashed border-[#C9CDD2] flex flex-col items-center justify-center text-xs font-bold text-[#565D66] cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}>
            <span className="text-lg leading-none" aria-hidden="true">＋</span>
            <span className="mt-1">{t("photoAdd")}</span>
            <input
              type="file" accept="image/*" multiple className="sr-only" disabled={busy}
              data-testid="photo-input"
              onChange={e => {
                const picked = Array.from(e.target.files ?? []);
                // 같은 파일을 다시 골라도 change 가 나도록 비운다.
                e.target.value = "";
                if (picked.length === 0) return;
                const take = picked.slice(0, PHOTO_MAX - total);
                onPicked(take);
                if (multi.stored !== undefined && multi.onStoredAdd) multi.onStoredAdd(take);
                else multi.setFiles([...multi.files, ...take]);
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[#565D66]/70">{t("photoMainRule")}</p>
      {notice && <p role="status" className="mt-1 text-[11px] font-bold text-[#565D66]" data-testid="photo-notice">{notice}</p>}
    </div>
  );
}
