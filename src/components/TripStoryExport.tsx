"use client";

// gokoreamate — Trip Story 9:16 Export Card
// TASK-022: canvas API PNG 생성
// TASK-024: Web Share API 1-tap 공유 + 3-tier fallback topology

import { reportShareEvent, shareIdFromUrl } from "@/lib/social/signals";
import ShareIcon from "@/components/ui/ShareIcon";
import { useRef, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
// 카드의 색·서체는 새로 정하지 않는다. 2026-08-17~18 에 디자이너 최종 화면을
// 390px 로 실측해 확정한 값(story-tokens)을 그대로 확대해 쓴다.
import {
  PRIMARY, ON_SURFACE, ON_PRIMARY_CONTAINER,
  MARGIN_MOBILE, STACK_MD, BASE,
} from "@/components/story/story-tokens";

/**
 * 이 카드가 그리는 것 전부.
 *
 * 예전에는 소유자 화면의 `TripMoment[]` 를 그대로 받았다. 그 타입에는 좌표·
 * 기기 식별자·비공개 메모·아직 아무도 못 본 로컬 사진이 함께 들어 있고,
 * 카드가 그 중 무엇을 쓰는지 타입만 봐서는 알 수 없었다. 실제로 쓰는 세 개만
 * 받으면 바깥으로 나갈 수 없는 값은 애초에 이 컴포넌트에 도달하지 않는다.
 *
 * `photoSrc` 는 주소다 — data URL 이든 공개 프록시 경로든 상관없다. 다만 공개
 * Story 경로에서는 항상 같은 출처의 `/img/memory/...` 가 들어온다.
 */
export interface StoryCardMoment {
  photoSrc: string | null;
  memo:     string;
  /** 사람이 읽는 장소 이름. 공개 payload 에 있는 값만 온다. 없으면 없는 대로 둔다. */
  placeName?: string | null;
  /** 공개 payload 에는 없다. 없으면 없는 대로 둔다 — 지어내지 않는다. */
  category?: string | null;
}

interface Props {
  city:        string;
  startDate:   string;
  endDate:     string;
  dayCount:    number;
  placeCount:  number;
  moments:     StoryCardMoment[];
  travelStyle: string;
  /**
   * 공유될 정확한 주소. **필수다** — 예전에는 없으면 홈페이지로 떨어졌고,
   * 그래서 카드를 받은 사람이 그 여행을 볼 수 없었다. 값을 반드시 받게 해
   * 그 폴백이 다시 생기지 못하게 한다.
   */
  shareUrl:    string;
  onClose:     () => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  /** 한 낱말이 혼자서도 폭을 넘으면 글자 단위로 끊는다 */
  const pushBroken = (word: string) => {
    let cur = "";
    for (const ch of word) {
      if (cur && ctx.measureText(cur + ch).width > maxWidth) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    line = cur;
  };
  for (const w of text.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
    if (line) { lines.push(line); line = ""; }
    // 일본어·중국어는 띄어쓰기가 없어 낱말 하나가 문장 전체다. 공백만 보고
    // 끊으면 줄바꿈이 일어나지 않아 제목이 카드 밖으로 잘려 나간다.
    if (ctx.measureText(w).width > maxWidth) pushBroken(w);
    else line = w;
  }
  if (line) lines.push(line);
  return lines;
}

// ── TASK-024: DataURL → File 변환 (메모리 내 가공, 패키지 없음) ───────────────
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime  = header?.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(base64 ?? "");
  const buf   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new File([buf], filename, { type: mime });
}

// 공유 텍스트. 문장은 locale 이 만들고 이 함수는 줄만 잇는다 — 예전에는
// 여기서 영어 문장을 조립해, KO/JA/ZH 사용자가 공유해도 영어가 나갔다.
function buildShareText(params: {
  title:    string;
  stats:    string;
  shareUrl: string;
}): string {
  return [params.title, params.stats, params.shareUrl].join("\n");
}

// ── TASK-024: Web Share API canShare 안전 탐침 ───────────────────────────────
function canShareFiles(file: File): boolean {
  try {
    return typeof navigator !== "undefined" &&
           typeof navigator.canShare === "function" &&
           navigator.canShare({ files: [file] });
  } catch { return false; }
}

// ══════════════════════════════════════════════════════════════════════════════

export default function TripStoryExport({
  city, startDate, endDate, dayCount, placeCount, moments, travelStyle, shareUrl, onClose,
}: Props) {
  const t = useTranslations("story");
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const [rendering,  setRendering]  = useState(false);
  const [rendered,   setRendered]   = useState(false);
  const [sharing,    setSharing]    = useState(false);
  const [copied,     setCopied]     = useState(false);
  // 경로 C 폴백 배너 메시지
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  // 공개 사진이 있는데 전부 못 받아 온 상태 — 공유를 막는다
  const [photoError, setPhotoError] = useState(false);


  // ── PNG 렌더링 ────────────────────────────────────────────────────────────
  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);

    // 시안은 390px 폭으로 그려졌다. 카드는 1080 이므로 토큰의 px 을 이 배율로
    // 키운다 — 여백·글자 크기를 카드용으로 따로 정하지 않기 위해서다.
    const W = 1080, H = 1920;
    const S = W / 390;
    const px = (n: number) => Math.round(n * S);
    const PAD = px(MARGIN_MOBILE);

    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // next/font 가 만든 실제 family 이름을 CSS 변수에서 꺼낸다. canvas 는 CSS
    // 변수를 모르므로 문자열로 풀어 넣어야 하고, 그리기 전에 로드도 기다린다.
    const cssVar = (n: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const serif = `${cssVar("--font-story-serif") || "Georgia"}, Georgia, serif`;
    const sans  = `${cssVar("--font-story-sans") || "system-ui"}, system-ui, sans-serif`;
    try {
      await Promise.all([
        document.fonts.load(`700 ${px(48)}px ${serif}`),
        document.fonts.load(`700 ${px(12)}px ${sans}`),
        document.fonts.ready,
      ]);
    } catch { /* 폰트를 못 받아도 fallback 으로 그린다 */ }

    // ── 사진 ────────────────────────────────────────────────────────────────
    // 한 장씩 따로 성공/실패한다. 묶음으로 처리하면 한 장만 실패해도 사진 있는
    // 여행이 사진 없는 카드가 되고, 그것을 사용자가 알 수 없다.
    const srcs = moments
      .map(m => m.photoSrc)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .slice(0, 3);

    let imgs: HTMLImageElement[] = [];
    if (srcs.length > 0) {
      const settled = await Promise.allSettled(srcs.map(loadImage));
      imgs = settled.flatMap(r => (r.status === "fulfilled" ? [r.value] : []));
      if (imgs.length === 0) {
        setPhotoError(true);
        setRendered(false);
        setRendering(false);
        return;
      }
    }
    setPhotoError(false);

    // 바탕. 사진이 없으면 이 색이 그대로 카드가 된다.
    ctx.fillStyle = ON_SURFACE;
    ctx.fillRect(0, 0, W, H);

    /** 비율을 지켜 채운다. 늘리지 않고 넘치는 쪽을 잘라낸다. */
    const drawCover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      const r = Math.max(w / img.width, h / img.height);
      const dw = img.width * r, dh = img.height * r;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    };

    if (imgs.length === 1) {
      drawCover(imgs[0]!, 0, 0, W, H);
    } else if (imgs.length === 2) {
      const top = Math.round(H * 0.62);
      drawCover(imgs[0]!, 0, 0, W, top);
      drawCover(imgs[1]!, 0, top, W, H - top);
    } else if (imgs.length >= 3) {
      const top = Math.round(H * 0.56);
      const half = Math.round(W / 2);
      drawCover(imgs[0]!, 0, 0, W, top);
      drawCover(imgs[1]!, 0, top, half, H - top);
      drawCover(imgs[2]!, half, top, W - half, H - top);
    } else {
      // 사진 없는 공개 Story — 시안의 사진 자리를 브랜드 색 그라디언트로 둔다
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#2A1D1A");
      g.addColorStop(1, PRIMARY);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 글자가 사진 위에서 읽히게 하는 유일한 장치. StoryCover 와 같은 정지색이다.
    const scrim = ctx.createLinearGradient(0, H, 0, 0);
    scrim.addColorStop(0,    "rgba(0,0,0,0.8)");
    scrim.addColorStop(0.42, "rgba(0,0,0,0.3)");
    scrim.addColorStop(1,    "rgba(0,0,0,0)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);

    /** 유리 알약. canvas 에는 backdrop blur 가 없어 반투명 흰색으로 근사한다. */
    const glassPill = (text: string, x: number, y: number, maxW: number) => {
      ctx.font = `500 ${px(14)}px ${sans}`;
      const padX = px(16), padY = px(8), icon = px(14), gap = px(8);
      // 칩이 오른쪽 연도 자리를 넘지 않게 글자를 먼저 줄인다. 길이(글자 수)로
      // 자르면 폭이 글꼴에 따라 달라져 어떤 이름은 여전히 넘친다.
      const room = maxW - (padX * 2 + icon + gap);
      let label = text;
      while (label.length > 1 && ctx.measureText(`${label}…`).width > room) {
        label = label.slice(0, -1);
      }
      if (label !== text) label = `${label}…`;
      text = label;
      const tw = ctx.measureText(text).width;
      const w = padX * 2 + icon + gap + tw;
      const h = px(14) * 1.6 + padY * 2;
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = Math.max(1, px(1));
      ctx.stroke();
      // 장소 핀 — StoryJournal 의 PlaceChip 과 같은 path 다
      ctx.save();
      ctx.translate(x + padX, y + h / 2 - icon / 2);
      ctx.scale(icon / 24, icon / 24);
      ctx.fillStyle = "#ffffff";
      ctx.fill(new Path2D("M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"));
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + padX + icon + gap, y + h / 2);
      ctx.textBaseline = "alphabetic";
      return h;
    };

    // ── 위: 장소 칩 + 연도 ──────────────────────────────────────────────────
    const year = (startDate.match(/^(\d{4})/) ?? [])[1];

    // 연도가 차지할 폭을 먼저 재고, 칩은 그 앞까지만 쓴다
    ctx.font = `italic 700 ${px(30)}px ${serif}`;
    const yearW = year ? ctx.measureText(year).width + px(16) : 0;
    const place = moments.find(m => m.placeName && m.placeName.trim() !== "")?.placeName?.trim();
    if (place) glassPill(place, PAD, PAD, W - PAD * 2 - yearW);

    if (year) {
      ctx.font = `italic 700 ${px(30)}px ${serif}`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.textAlign = "right";
      ctx.fillText(year, W - PAD, PAD + px(34));
    }

    // ── 아래: 제목 블록 ─────────────────────────────────────────────────────
    // 아래에서 위로 쌓는다 — 메모 길이에 따라 제목이 밀려 잘리지 않게 하기 위해서다.
    ctx.textAlign = "left";
    let y = H - PAD - px(BASE);

    // 워드마크는 소문자다(브랜드 규칙)
    ctx.font = `700 ${px(13)}px ${sans}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("gokoreamate", PAD, y);
    y -= px(STACK_MD) + px(6);

    // 메모 — 시안의 유리 카드 안 손글씨 자리. 서체는 승인된 serif 를 쓴다.
    const memo = moments.find(m => m.memo && m.memo.trim() !== "")?.memo?.trim();
    if (memo) {
      const fs = px(24);
      ctx.font = `italic 400 ${fs}px ${serif}`;
      const inner = W - PAD * 2 - px(24) * 2;
      const all = wrapText(ctx, `“${memo}”`, inner);
      const MAX_LINES = 4;
      const lines = all.slice(0, MAX_LINES);
      // 줄 수 때문에 잘렸으면 마지막 줄에 말줄임을 남긴다 — 문장이 그냥
      // 끊긴 것처럼 보이면 사용자는 글이 지워진 줄 안다.
      if (all.length > MAX_LINES && lines.length > 0) {
        let last = lines[lines.length - 1]!.replace(/[”"]?$/, "");
        while (last.length > 1 && ctx.measureText(`${last}…”`).width > inner) last = last.slice(0, -1);
        lines[lines.length - 1] = `${last}…”`;
      }
      const lh = Math.round(fs * 1.5);
      const boxH = lines.length * lh + px(24) * 2;
      const boxY = y - boxH;
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.roundRect(PAD, boxY, W - PAD * 2, boxH, px(12));
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      let my = boxY + px(24) + fs;
      for (const line of lines) { ctx.fillText(line, PAD + px(24), my); my += lh; }
      y = boxY - px(STACK_MD);
    }

    // 제목 — "{N} Days in {City}". 시안의 큰 serif 제목 자리다.
    const cityCap = city.charAt(0).toUpperCase() + city.slice(1);
    const titleFs = px(46);
    ctx.font = `700 ${titleFs}px ${serif}`;
    // 카드에 그려지는 문장도 locale 이 만든다. 도시 이름은 데이터 값 그대로다 —
    // 없는 번역 표를 지어내면 실제 장소와 다른 이름이 카드에 찍힌다.
    const headline = t("cardHeadline", { n: dayCount, city: cityCap });
    const titleLines = wrapText(ctx, headline, W - PAD * 2).slice(0, 3);
    const titleLh = Math.round(titleFs * 1.2);
    // `y` 는 마지막 줄의 baseline 이다. 여러 줄이면 첫 줄은 그만큼 위에서 시작한다.
    const titleTop = y - (titleLines.length - 1) * titleLh;
    ctx.fillStyle = "#ffffff";
    let ty = titleTop;
    for (const line of titleLines) { ctx.fillText(line, PAD, ty); ty += titleLh; }
    // eyebrow 는 **첫 줄 글자 위**로 올린다. 예전에는 마지막 baseline 기준으로
    // 조금만 올려서, 두 줄짜리 제목이면 글자 위에 겹쳐 그려졌다.
    // 0.85 는 라틴 대문자 높이 기준이라 CJK 글자에서는 eyebrow 와 거의 붙는다.
    // 한자·가나는 글자 상자를 가득 채우므로 여유를 조금 더 둔다.
    y = titleTop - Math.round(titleFs * 0.98);

    // eyebrow — 날짜와 장소 수. 셀 수 있는 값만 적는다.
    ctx.font = `700 ${px(13)}px ${sans}`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const eyebrow = [`${startDate} – ${endDate}`, t("cardPlaces", { n: placeCount })]
      .join("  ·  ").toUpperCase();
    // letterSpacing 은 canvas 2D 표준 속성이다(미지원 브라우저에서는 무시된다)
    ctx.letterSpacing = `${px(1.2)}px`;
    ctx.fillText(eyebrow, PAD, y);
    ctx.letterSpacing = "0px";

    setRendering(false);
    setRendered(true);
  }, [moments, city, startDate, endDate, dayCount, placeCount, t]);

  // ── PNG 파일명 ────────────────────────────────────────────────────────────
  const pngFilename = `gokoreamate-${city.toLowerCase()}-${startDate}.png`;

  // ── 경로 C 폴백: PNG 저장 + 링크 복사 + 배너 노출 ────────────────────────
  const runFallback = useCallback(async () => {
    // 1. PNG 자동 다운로드
    const canvas = canvasRef.current;
    if (canvas) {
      const link = document.createElement("a");
      link.download = pngFilename;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }
    // 2. 링크 클립보드 복사
    try {
      await navigator.clipboard.writeText(shareUrl);
      const sid = shareIdFromUrl(shareUrl);
      if (sid) reportShareEvent("story", sid, "copy_link");
    } catch { /* 무시 */ }
    // 3. 배너 노출 (3초 후 자동 소멸)
    setFallbackMsg(t("savedAndCopied"));
    setTimeout(() => setFallbackMsg(null), 3500);
  }, [pngFilename, t]);

  // ── TASK-024: 핵심 공유 핸들러 (Web Share API 3-tier fallback) ───────────
  // 반드시 유저 제스처(click) 컨텍스트 내에서 호출되어야 함 (브라우저 보안 정책)
  const handleShare = useCallback(async () => {
    if (!rendered || sharing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSharing(true);
    const dataUrl   = canvas.toDataURL("image/png");
    const cityCap    = city.charAt(0).toUpperCase() + city.slice(1);
    const memoPart   = moments.length > 0 ? ` · ${t("shareTextMemories", { n: moments.length })}` : "";
    const shareText  = buildShareText({
      title: t("shareTextTitle", { city: cityCap }),
      stats: `${t("shareTextStats", { days: dayCount, places: placeCount })}${memoPart}`,
      shareUrl,
    });
    const shareTitle = `${t("shareTextTitle", { city: cityCap })} — gokoreamate.com`;

    // [Guard 1] Web Share API 미지원 환경 → 경로 C
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      await runFallback();
      setSharing(false);
      return;
    }

    const pngFile = dataUrlToFile(dataUrl, pngFilename);

    // [경로 A] 파일 공유 지원 확인 → 네이티브 공유 시트 + PNG 첨부
    if (canShareFiles(pngFile)) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl, files: [pngFile] });
        { const sid = shareIdFromUrl(shareUrl); if (sid) reportShareEvent("story", sid, "web_share"); }
        setSharing(false);
        return;
      } catch (err) {
        // AbortError: 유저가 직접 취소 → 크래시 없이 종료
        if ((err as DOMException).name === "AbortError") { setSharing(false); return; }
        // 기타 오류 → 경로 B로 강등
      }
    }

    // [경로 B] 파일 불허 but share 지원 → 텍스트+URL 공유 시트
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      { const sid = shareIdFromUrl(shareUrl); if (sid) reportShareEvent("story", sid, "web_share"); }
      setSharing(false);
      return;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") { setSharing(false); return; }
      // 최종 실패 → 경로 C
    }

    // [경로 C] 모든 share 시도 실패 → PNG 다운로드 + 링크 복사 + 배너
    await runFallback();
    setSharing(false);
  }, [rendered, sharing, city, dayCount, placeCount, moments, shareUrl, pngFilename, runFallback, t]);

  // ── PNG 직접 다운로드 (Secondary 버튼) ────────────────────────────────────
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = pngFilename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [pngFilename]);

  // ── 링크 복사 버튼 ────────────────────────────────────────────────────────
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("copyPrompt"), shareUrl);
    }
  }, []);

  const nativeShareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1a1a2e] rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-black text-white">{t("cardTitle")}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl cursor-pointer">✕</button>
        </div>

        {/* 캔버스 미리보기 */}
        <div className="p-4">
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl"
            style={{ aspectRatio: "9/16", background: "#16213e" }}
          />
        </div>

        {/* 공개 사진을 한 장도 받아 오지 못함 — 공유를 막고 다시 시도하게 한다 */}
        {photoError && (
          <div
            role="alert"
            className="mx-5 mb-3 px-4 py-3 rounded-xl bg-red-900/50 border border-red-500/40 text-xs font-bold text-red-200 text-center"
          >
            {t("photoLoadFailed")}
          </div>
        )}

        {/* 경로 C 폴백 배너 */}
        {fallbackMsg && (
          <div className="mx-5 mb-3 px-4 py-3 rounded-xl bg-emerald-900/60 border border-emerald-500/40 text-xs font-bold text-emerald-300 text-center">
            {fallbackMsg}
          </div>
        )}

        {/* 액션 버튼 영역 */}
        <div className="px-5 pb-6 space-y-2.5">
          {!rendered ? (
            /* 렌더링 전 — 카드 생성 버튼 */
            <button
              onClick={render}
              disabled={rendering}
              className="w-full py-3.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              {rendering ? t("creating") : photoError ? `↻ ${t("tryAgain")}` : t("createCard")}
            </button>
          ) : (
            <>
              {/* Primary: 1탭 공유 (Web Share API) */}
              <button
                onClick={handleShare}
                disabled={sharing}
                className="w-full py-3.5 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {!sharing && <ShareIcon size={15} strokeWidth={2} />}
                  {sharing
                    ? t("sharing")
                    : nativeShareSupported
                    ? t("shareNow")
                    : t("shareCard")}
                </span>
              </button>

              {/* Secondary row: 이미지 저장 + 링크 복사 */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white/70 hover:text-white border border-white/15 hover:border-white/30 transition-all cursor-pointer"
                >
                  {t("saveImage")}
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border"
                  style={copied
                    ? { backgroundColor: "#065f46", borderColor: "#10b981", color: "#6ee7b7" }
                    : { backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
                >
                  {copied ? `✓ ${t("linkCopied")}` : t("copyLink")}
                </button>
              </div>

              {/* 다시 생성 */}
              <button
                onClick={render}
                className="w-full py-2 rounded-xl text-xs font-bold text-white/30 hover:text-white/60 transition-colors cursor-pointer"
              >
                {t("regenerate")}
              </button>
            </>
          )}

          <p className="text-center text-[10px] text-white/20">
            {t("formatHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
