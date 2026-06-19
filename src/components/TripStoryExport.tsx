"use client";

// gokoreamate — Trip Story 9:16 Export Card
// TASK-022: canvas API PNG 생성
// TASK-024: Web Share API 1-tap 공유 + 3-tier fallback topology

import { useRef, useCallback, useState } from "react";
import type { TripMoment } from "@/lib/trip-moments/types";

interface Props {
  city:        string;
  startDate:   string;
  endDate:     string;
  dayCount:    number;
  placeCount:  number;
  moments:     TripMoment[];
  travelStyle: string;
  onClose:     () => void;
}

// ── 여행 퍼스낼리티 분류 ──────────────────────────────────────────────────────
function getTravelPersonality(moments: TripMoment[], travelStyle: string): { emoji: string; title: string; desc: string } {
  const counts: Record<string, number> = {};
  for (const m of moments) counts[m.category] = (counts[m.category] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const s   = travelStyle.toLowerCase();
  if (top === "food"    || s.includes("food"))      return { emoji: "🍜", title: "Busan Foodie",       desc: "Every alley hides a masterpiece" };
  if (top === "scenery" || s.includes("nature"))    return { emoji: "🌿", title: "Nature Wanderer",    desc: "Found beauty in unexpected places" };
  if (top === "people"  || s.includes("social"))    return { emoji: "👥", title: "Story Collector",    desc: "Every stranger has a story" };
  if (top === "culture" || s.includes("culture"))   return { emoji: "🏛️", title: "Cultural Nomad",     desc: "Living history one step at a time" };
  if (s.includes("adventure") || s.includes("solo")) return { emoji: "⚡", title: "Solo Adventurer",  desc: "No plan, all experience" };
  if (s.includes("couple"))                          return { emoji: "💫", title: "Romantic Explorer", desc: "Korea written in two hearts" };
  return                                             { emoji: "✨", title: "Korea Moment Hunter",       desc: "Turning the unexpected into unforgettable" };
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
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
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

// ── TASK-024: 바이럴 텍스트 동적 파싱 파이프라인 ─────────────────────────────
function buildShareText(params: {
  city:        string;
  dayCount:    number;
  placeCount:  number;
  momentCount: number;
  personality: string;
}): string {
  const cityCap   = params.city.charAt(0).toUpperCase() + params.city.slice(1);
  const memoPart  = params.momentCount > 0 ? ` · ${params.momentCount} memories` : "";
  return [
    `나의 ${cityCap} 여행 🇰🇷`,
    `AI로 만든 ${params.dayCount}일 일정 · ${params.placeCount} spots${memoPart}`,
    params.personality,
    "gokoreamate.com",
  ].join("\n");
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
  city, startDate, endDate, dayCount, placeCount, moments, travelStyle, onClose,
}: Props) {
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const [rendering,  setRendering]  = useState(false);
  const [rendered,   setRendered]   = useState(false);
  const [sharing,    setSharing]    = useState(false);
  const [copied,     setCopied]     = useState(false);
  // 경로 C 폴백 배너 메시지
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);

  const personality = getTravelPersonality(moments, travelStyle);

  // ── PNG 렌더링 ────────────────────────────────────────────────────────────
  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);

    const W = 1080, H = 1920;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   "#1a1a2e");
    bg.addColorStop(0.5, "#16213e");
    bg.addColorStop(1,   "#0f3460");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const photoMoments = moments.filter(m => m.photo_data).slice(0, 3);
    if (photoMoments.length > 0) {
      const PHOTO_H = Math.round(H * 0.58);
      const PAD = 8;
      try {
        const imgs = await Promise.all(photoMoments.map(m => loadImage(m.photo_data!)));
        if (imgs.length === 1) {
          ctx.save(); ctx.beginPath();
          ctx.roundRect(PAD, PAD, W - PAD * 2, PHOTO_H - PAD, 28); ctx.clip();
          ctx.drawImage(imgs[0], PAD, PAD, W - PAD * 2, PHOTO_H - PAD); ctx.restore();
        } else if (imgs.length === 2) {
          const half = (W - PAD * 3) / 2;
          for (let i = 0; i < 2; i++) {
            ctx.save(); ctx.beginPath();
            ctx.roundRect(PAD + i * (half + PAD), PAD, half, PHOTO_H - PAD, 24); ctx.clip();
            ctx.drawImage(imgs[i], PAD + i * (half + PAD), PAD, half, PHOTO_H - PAD); ctx.restore();
          }
        } else {
          const main = (W - PAD * 3) * 0.62, side = W - PAD * 3 - main;
          ctx.save(); ctx.beginPath();
          ctx.roundRect(PAD, PAD, main, PHOTO_H - PAD, 24); ctx.clip();
          ctx.drawImage(imgs[0], PAD, PAD, main, PHOTO_H - PAD); ctx.restore();
          const halfH = (PHOTO_H - PAD * 3) / 2;
          for (let i = 0; i < 2; i++) {
            ctx.save(); ctx.beginPath();
            ctx.roundRect(PAD * 2 + main, PAD + i * (halfH + PAD), side, halfH, 20); ctx.clip();
            ctx.drawImage(imgs[i + 1], PAD * 2 + main, PAD + i * (halfH + PAD), side, halfH); ctx.restore();
          }
        }
      } catch { /* 이미지 로드 실패 무시 */ }

      const photoOverlay = ctx.createLinearGradient(0, PHOTO_H * 0.6, 0, PHOTO_H);
      photoOverlay.addColorStop(0, "rgba(26,26,46,0)");
      photoOverlay.addColorStop(1, "rgba(26,26,46,0.92)");
      ctx.fillStyle = photoOverlay;
      ctx.fillRect(0, 0, W, PHOTO_H + PAD);
    }

    const lineY = Math.round(H * 0.60);
    ctx.strokeStyle = "#D4AF37"; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(60, lineY); ctx.lineTo(W - 60, lineY); ctx.stroke();
    ctx.globalAlpha = 1;

    let y = lineY + 60;
    ctx.fillStyle = "#D4AF37"; ctx.font = "bold 38px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`${personality.emoji}  ${personality.title}`, W / 2, y); y += 52;
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "400 30px system-ui, sans-serif";
    for (const line of wrapText(ctx, personality.desc, W - 120)) { ctx.fillText(line, W / 2, y); y += 40; }
    y += 30;

    const cityCap = city.charAt(0).toUpperCase() + city.slice(1);
    ctx.fillStyle = "#ffffff"; ctx.font = "black 90px system-ui, sans-serif";
    ctx.fillText(`My ${cityCap} Trip`, W / 2, y); y += 100;
    ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.font = "500 34px system-ui, sans-serif";
    ctx.fillText(`${startDate}  →  ${endDate}`, W / 2, y); y += 70;

    const stats = [`${dayCount} Days`, `${placeCount} Spots`, moments.length > 0 ? `${moments.length} Memories` : null].filter(Boolean) as string[];
    const chipW = 220, chipGap = 18, totalW = stats.length * chipW + (stats.length - 1) * chipGap;
    let chipX = (W - totalW) / 2;
    for (const stat of stats) {
      ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.beginPath();
      ctx.roundRect(chipX, y - 40, chipW, 60, 18); ctx.fill();
      ctx.fillStyle = "#D4AF37"; ctx.font = "bold 30px system-ui, sans-serif";
      ctx.fillText(stat, chipX + chipW / 2, y); chipX += chipW + chipGap;
    }
    y += 60;

    const firstMemo = moments.find(m => m.memo)?.memo;
    if (firstMemo) {
      y += 40;
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath();
      ctx.roundRect(60, y, W - 120, 140, 20); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "400 italic 28px system-ui, sans-serif";
      ctx.textAlign = "left";
      const memoLines = wrapText(ctx, `"${firstMemo.slice(0, 80)}${firstMemo.length > 80 ? "…" : ""}"`, W - 160);
      let my = y + 46;
      for (const line of memoLines.slice(0, 3)) { ctx.fillText(line, 80, my); my += 38; }
      ctx.textAlign = "center"; y += 160;
    }

    ctx.fillStyle = "rgba(212,175,55,0.8)"; ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText("gokoreamate.com", W / 2, H - 70);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.font = "400 26px system-ui, sans-serif";
    ctx.fillText("Plan your Korea trip →", W / 2, H - 30);

    setRendering(false);
    setRendered(true);
  }, [moments, city, startDate, endDate, dayCount, placeCount, travelStyle, personality]);

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
    try { await navigator.clipboard.writeText("https://gokoreamate.com"); } catch { /* 무시 */ }
    // 3. 배너 노출 (3초 후 자동 소멸)
    setFallbackMsg("📥 이미지가 저장되었습니다. 링크도 복사했어요 — SNS에 붙여넣으세요");
    setTimeout(() => setFallbackMsg(null), 3500);
  }, [pngFilename]);

  // ── TASK-024: 핵심 공유 핸들러 (Web Share API 3-tier fallback) ───────────
  // 반드시 유저 제스처(click) 컨텍스트 내에서 호출되어야 함 (브라우저 보안 정책)
  const handleShare = useCallback(async () => {
    if (!rendered || sharing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSharing(true);
    const dataUrl   = canvas.toDataURL("image/png");
    const shareText = buildShareText({
      city,
      dayCount,
      placeCount,
      momentCount: moments.length,
      personality: `${personality.emoji} ${personality.title}`,
    });
    const shareUrl  = "https://gokoreamate.com";
    const shareTitle = `나의 ${city.charAt(0).toUpperCase() + city.slice(1)} 여행 — gokoreamate.com`;

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
      setSharing(false);
      return;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") { setSharing(false); return; }
      // 최종 실패 → 경로 C
    }

    // [경로 C] 모든 share 시도 실패 → PNG 다운로드 + 링크 복사 + 배너
    await runFallback();
    setSharing(false);
  }, [rendered, sharing, city, dayCount, placeCount, moments, personality, pngFilename, runFallback]);

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
      await navigator.clipboard.writeText("https://gokoreamate.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("링크를 복사하세요:", "https://gokoreamate.com");
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
          <h2 className="text-base font-black text-white">🎴 여행 공유 카드</h2>
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
              className="w-full py-3.5 rounded-xl text-sm font-black text-[#1a1a2e] transition-all disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: "#D4AF37" }}
            >
              {rendering ? "생성 중…" : "✨ 카드 생성하기"}
            </button>
          ) : (
            <>
              {/* Primary: 1탭 공유 (Web Share API) */}
              <button
                onClick={handleShare}
                disabled={sharing}
                className="w-full py-3.5 rounded-xl text-sm font-black text-[#1a1a2e] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: "#D4AF37" }}
              >
                {sharing
                  ? "공유 중…"
                  : nativeShareSupported
                  ? "📤 지금 공유하기 (1탭)"
                  : "📤 공유하기"}
              </button>

              {/* Secondary row: 이미지 저장 + 링크 복사 */}
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white/70 hover:text-white border border-white/15 hover:border-white/30 transition-all cursor-pointer"
                >
                  ⬇️ 이미지 저장
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border"
                  style={copied
                    ? { backgroundColor: "#065f46", borderColor: "#10b981", color: "#6ee7b7" }
                    : { backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
                >
                  {copied ? "✅ 복사됨" : "🔗 링크 복사"}
                </button>
              </div>

              {/* 다시 생성 */}
              <button
                onClick={render}
                className="w-full py-2 rounded-xl text-xs font-bold text-white/30 hover:text-white/60 transition-colors cursor-pointer"
              >
                다시 생성
              </button>
            </>
          )}

          <p className="text-center text-[10px] text-white/20">
            9:16 · Instagram Stories · TikTok · X 최적화
          </p>
        </div>
      </div>
    </div>
  );
}
