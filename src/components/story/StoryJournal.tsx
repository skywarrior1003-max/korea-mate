"use client";

// Travel Journal — Story 의 본체. (MYTRIP-AI-STORY-MAP-AND-SHARE-PREVIEW-V1 §B)
//
// 왼쪽 세로선 + DAY 점 구조는 시안 그대로다. 바뀐 것은 "하루 대표 사진 한 장이
// 화면 높이를 독점하며 반복되는" 배치다:
//   · 각 방문 장소가 순서 번호·장소명·사진 한 장을 가진 카드가 된다.
//   · 개인 순간(kind:"moment")이 있는 장소가 시각적 우선 — full-width 강조 카드에
//     저장된 제목(title)과 본문(memo)이 함께 붙는다. 특정 장소를 무조건 첫 대형
//     사진으로 만들지 않는다 — 우선순위는 개인 기록의 존재다.
//   · 일정 골격(stop) 카드는 반응형 그리드다: 하루 2곳 이하는 전부 큰 카드,
//     3곳 이상은 모바일 1열 · sm+ 2열(4곳 = 데스크톱 2×2). 5곳 이상도 같은
//     그리드가 화면 길이를 관리한다 — 장소명과 순서는 전부 유지된다.
//   · 사진 비율은 16:10 — 한 장이 화면 전체를 차지하지 않으면서 썸네일로
//     쪼그라들지도 않는다. 개인 순간의 보조 사진(2장+)은 기존 언어(반폭 두 장,
//     +N 접기)를 유지한다.
//
// 만들어 내지 않는다: 기록 없는 장소에 메모·감정 문장을 붙이지 않고, 공식
// 카탈로그 사진을 개인 사진처럼 표현하지 않는다(장소 카드는 장소명 칩뿐이다).

import type { StoryDay, StoryMemory, StoryPhoto } from "./story-types";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, GUTTER,
  HEADLINE_LG, HEADLINE_LG_MOBILE, BODY_SM, TITLE_MD,
  ON_SURFACE, ON_SURFACE_VARIANT, SURFACE_VARIANT, PRIMARY,
  RADIUS_PHOTO, AMBIENT_SHADOW, GLASS_OVERLAY,
} from "./story-tokens";

interface Props {
  id?: string;
  days: StoryDay[];
  /** 사진을 누르면 Focus 로 간다. 없으면 사진은 누를 수 없다. */
  onOpenPhoto?: (memory: StoryMemory, index: number) => void;
  /**
   * Save. **연결되지 않았으면 넘기지 않는다** — 눌러도 아무 일도 없는 버튼을
   * 공개 화면에 두지 않기 위해서다. 기능이 붙는 후속 작업에서 넘긴다.
   */
  onSave?: (memory: StoryMemory) => void;
  savedIds?: ReadonlySet<string>;
  /** 사진 로드 실패 — 소유자 화면이 서명 주소를 한 번 다시 받는 데 쓴다. 공개 화면은 넘기지 않는다. */
  onPhotoError?: (memory: StoryMemory, index: number) => void;
}

function PlaceChip({ name, order }: { name?: string; order?: number }) {
  if (!name && order === undefined) return null;
  return (
    <div
      className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full flex items-center gap-2 max-w-[85%]"
      style={GLASS_OVERLAY}
    >
      {order !== undefined && (
        <span
          className="flex-none w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center"
          style={{ backgroundColor: PRIMARY, color: "#fff" }}
          aria-hidden
        >
          {order}
        </span>
      )}
      {name && <span className="text-white font-medium truncate" style={BODY_SM}>{name}</span>}
    </div>
  );
}

function Photo({
  photo, alt, className, style, onClick, chip, chipOrder, overlayCount, onError,
}: {
  photo: StoryPhoto; alt: string; className?: string;
  style?: React.CSSProperties; onClick?: () => void;
  chip?: string; chipOrder?: number; overlayCount?: number; onError?: () => void;
}) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.alt ?? alt} className="w-full h-full object-cover" onError={onError} />
      {(chip || chipOrder !== undefined) && <PlaceChip name={chip} order={chipOrder} />}
      {overlayCount != null && overlayCount > 0 && (
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
          <span className="text-white" style={{ ...TITLE_MD, fontSize: "20px" }}>+{overlayCount}</span>
        </div>
      )}
    </>
  );
  const box = `relative overflow-hidden ${className ?? ""}`;
  const css = { borderRadius: RADIUS_PHOTO, boxShadow: AMBIENT_SHADOW, ...style };
  return onClick
    ? <button type="button" onClick={onClick} className={`${box} gkm-focus block w-full`} style={css}>{inner}</button>
    : <div className={box} style={css}>{inner}</div>;
}

/** 사진 없는 장소 카드의 본문 — 이름과 순서만. 가짜 이미지·문장을 만들지 않는다. */
function NoPhotoBody({ memory }: { memory: StoryMemory }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-5"
      style={{ borderRadius: RADIUS_PHOTO, border: `1px solid ${SURFACE_VARIANT}` }}
    >
      {memory.order !== undefined && (
        <span
          className="flex-none w-6 h-6 rounded-full text-[12px] font-bold flex items-center justify-center"
          style={{ backgroundColor: PRIMARY, color: "#fff" }}
          aria-hidden
        >
          {memory.order}
        </span>
      )}
      <p style={{ ...TITLE_MD, color: ON_SURFACE }}>{memory.placeName}</p>
    </div>
  );
}

/** 개인 순간 — full width 강조 카드: 사진(16:10) + 제목 + 본문(+ 보조 사진). */
function MomentBlock({ memory, onOpenPhoto, onSave, saved, onPhotoError }: {
  memory: StoryMemory;
  onOpenPhoto?: (m: StoryMemory, i: number) => void;
  onSave?: (m: StoryMemory) => void;
  saved?: boolean;
  onPhotoError?: (m: StoryMemory, i: number) => void;
}) {
  const photos = memory.photos;
  const hasMemo = memory.memo.trim() !== "";
  const hasTitle = (memory.title ?? "").trim() !== "";
  const alt = memory.placeName ?? (hasMemo ? memory.memo.slice(0, 40) : "");
  const open = (i: number) => onOpenPhoto ? () => onOpenPhoto(memory, i) : undefined;
  const failed = (i: number) => onPhotoError ? () => onPhotoError(memory, i) : undefined;
  const secondary = photos.slice(1, 3);
  const hidden = Math.max(0, photos.length - 3);

  return (
    <div style={{ marginBottom: STACK_MD }}>
      {photos.length > 0 ? (
        <Photo
          photo={photos[0]!} alt={alt} onClick={open(0)} onError={failed(0)}
          chip={memory.placeName} chipOrder={memory.order}
          className="w-full aspect-[16/10]"
          style={{ marginBottom: GUTTER }}
        />
      ) : (
        memory.placeName && <NoPhotoBody memory={memory} />
      )}

      {secondary.length > 0 && (
        <div className="flex" style={{ gap: GUTTER, marginBottom: GUTTER }}>
          {secondary.map((p, i) => (
            <Photo
              key={p.url} photo={p} alt={alt} onClick={open(i + 1)} onError={failed(i + 1)}
              className="w-1/2 aspect-[16/10]"
              overlayCount={i === secondary.length - 1 ? hidden : 0}
            />
          ))}
        </div>
      )}

      {(hasTitle || hasMemo || onSave) && (
        <div className="flex justify-between items-start" style={{ marginTop: 14, paddingLeft: 12, paddingRight: 12 }}>
          <div className="flex-1 pr-4 min-w-0">
            {/* 저장된 제목·본문 그대로 — 여기서 다듬거나 만들어 내지 않는다. */}
            {hasTitle && (
              <p style={{ ...HEADLINE_LG_MOBILE, color: ON_SURFACE, marginBottom: hasMemo ? 6 : 0 }}>
                {memory.title}
              </p>
            )}
            {hasMemo && (
              <p className="italic" style={{ ...BODY_SM, fontSize: "16px", lineHeight: 1.6, color: hasTitle ? ON_SURFACE_VARIANT : ON_SURFACE }}>
                {`“${memory.memo}”`}
              </p>
            )}
          </div>
          {onSave && (
            <button
              type="button"
              onClick={() => onSave(memory)}
              aria-pressed={saved === true}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full transition-colors gkm-focus"
              style={{ ...TITLE_MD, color: ON_SURFACE_VARIANT, border: `1px solid ${SURFACE_VARIANT}` }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden
                   fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
                   style={{ color: PRIMARY }}>
                <path d="M12 21s-7-4.35-9.33-8.5A5.5 5.5 0 0112 5.5a5.5 5.5 0 019.33 7c-2.33 4.15-9.33 8.5-9.33 8.5z" />
              </svg>
              Save
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 일정 골격 장소 카드 — 순서 번호·장소명·카탈로그 사진 한 장. 창작 문장 없음. */
function StopCard({ memory, onOpenPhoto, onPhotoError }: {
  memory: StoryMemory;
  onOpenPhoto?: (m: StoryMemory, i: number) => void;
  onPhotoError?: (m: StoryMemory, i: number) => void;
}) {
  const photo = memory.photos[0];
  const alt = memory.placeName ?? "";
  return photo ? (
    <Photo
      photo={photo} alt={alt}
      onClick={onOpenPhoto ? () => onOpenPhoto(memory, 0) : undefined}
      onError={onPhotoError ? () => onPhotoError(memory, 0) : undefined}
      chip={memory.placeName} chipOrder={memory.order}
      className="w-full aspect-[16/10]"
    />
  ) : (
    <NoPhotoBody memory={memory} />
  );
}

/** Day 항목을 [moment 강조] 와 [연속 stop 그리드] 세그먼트로 — 순서는 그대로다. */
function daySegments(items: StoryMemory[]): Array<{ type: "moment"; item: StoryMemory } | { type: "stops"; items: StoryMemory[] }> {
  const segs: Array<{ type: "moment"; item: StoryMemory } | { type: "stops"; items: StoryMemory[] }> = [];
  for (const item of items) {
    if (item.kind === "moment") { segs.push({ type: "moment", item }); continue; }
    const last = segs[segs.length - 1];
    if (last && last.type === "stops") last.items.push(item);
    else segs.push({ type: "stops", items: [item] });
  }
  return segs;
}

export default function StoryJournal({ id, days, onOpenPhoto, onSave, savedIds, onPhotoError }: Props) {
  return (
    <section
      id={id}
      className="max-w-4xl mx-auto"
      style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingTop: 80, paddingBottom: 80 }}
    >
      {days.map(day => {
        const total = day.memories.length;
        // 하루 2곳 이하 = 전부 큰 카드(1열). 3곳 이상 = sm+ 2열(4곳 → 2×2), 모바일 1열.
        const gridCols = total <= 2 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";
        return (
          <div
            key={day.dayNumber}
            className="relative pl-6"
            style={{ marginBottom: STACK_LG, borderLeft: `2px solid ${SURFACE_VARIANT}` }}
          >
            <div
              className="absolute top-2 w-2 h-2 rounded-full"
              style={{ left: -5, backgroundColor: PRIMARY }}
            />
            <h2 className="mb-1" style={{ ...HEADLINE_LG, color: ON_SURFACE }}>
              DAY {day.dayNumber}
            </h2>
            <p
              className="uppercase"
              style={{ ...BODY_SM, color: ON_SURFACE_VARIANT, letterSpacing: "0.05em", marginBottom: STACK_MD }}
            >
              {day.dateLabel}
            </p>

            {daySegments(day.memories).map((seg, si) =>
              seg.type === "moment" ? (
                <MomentBlock
                  key={seg.item.id} memory={seg.item}
                  onOpenPhoto={onOpenPhoto} onSave={onSave} onPhotoError={onPhotoError}
                  saved={savedIds?.has(seg.item.id)}
                />
              ) : (
                <div key={`stops-${day.dayNumber}-${si}`} className={`grid ${gridCols}`}
                     style={{ gap: GUTTER, marginBottom: STACK_MD }}>
                  {seg.items.map(m => (
                    <StopCard key={m.id} memory={m} onOpenPhoto={onOpenPhoto} onPhotoError={onPhotoError} />
                  ))}
                </div>
              ),
            )}
          </div>
        );
      })}
    </section>
  );
}
