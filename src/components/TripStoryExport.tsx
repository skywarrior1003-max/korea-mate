"use client";

// gokoreamate — Trip Story 9:16 Export Card
// TASK-022: canvas API로 Instagram/TikTok 공유 카드 PNG 생성 (패키지 추가 없음)

import { useRef, useCallback, useState } from "react";
import type { TripMoment } from "@/lib/trip-moments/types";
import { MOMENT_CATEGORIES } from "@/lib/trip-moments/types";

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

// 여행 퍼스낼리티 분류
function getTravelPersonality(moments: TripMoment[], travelStyle: string): { emoji: string; title: string; desc: string } {
  const counts: Record<string, number> = {};
  for (const m of moments) counts[m.category] = (counts[m.category] ?? 0) + 1;

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const s   = travelStyle.toLowerCase();

  if (top === "food"    || s.includes("food"))     return { emoji: "🍜", title: "Busan Foodie",        desc: "Every alley hides a masterpiece" };
  if (top === "scenery" || s.includes("nature"))   return { emoji: "🌿", title: "Nature Wanderer",     desc: "Found beauty in unexpected places" };
  if (top === "people"  || s.includes("social"))   return { emoji: "👥", title: "Story Collector",     desc: "Every stranger has a story" };
  if (top === "culture" || s.includes("culture"))  return { emoji: "🏛️", title: "Cultural Nomad",      desc: "Living history one step at a time" };
  if (s.includes("adventure") || s.includes("solo")) return { emoji: "⚡", title: "Solo Adventurer",   desc: "No plan, all experience" };
  if (s.includes("couple"))                         return { emoji: "💫", title: "Romantic Explorer",  desc: "Korea written in two hearts" };
  return                                            { emoji: "✨", title: "Korea Moment Hunter",        desc: "Turning the unexpected into unforgettable" };
}

// 이미지 URL → HTMLImageElement (CORS-safe)
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 텍스트 줄바꿈 helper
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}

export default function TripStoryExport({ city, startDate, endDate, dayCount, placeCount, moments, travelStyle, onClose }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [rendering,  setRendering]  = useState(false);
  const [rendered,   setRendered]   = useState(false);
  const personality  = getTravelPersonality(moments, travelStyle);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);

    // 9:16 비율 — Instagram Stories 표준 1080×1920
    const W = 1080, H = 1920;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // ── 배경 그라디언트 ───────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   "#1a1a2e");
    bg.addColorStop(0.5, "#16213e");
    bg.addColorStop(1,   "#0f3460");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── 사진 콜라주 (상단 60%) ────────────────────────────────
    const photoMoments = moments.filter(m => m.photo_data).slice(0, 3);
    if (photoMoments.length > 0) {
      const PHOTO_H = Math.round(H * 0.58);
      const PAD = 8;

      try {
        const imgs = await Promise.all(photoMoments.map(m => loadImage(m.photo_data!)));

        if (imgs.length === 1) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(PAD, PAD, W - PAD * 2, PHOTO_H - PAD, 28);
          ctx.clip();
          ctx.drawImage(imgs[0], PAD, PAD, W - PAD * 2, PHOTO_H - PAD);
          ctx.restore();
        } else if (imgs.length === 2) {
          const half = (W - PAD * 3) / 2;
          for (let i = 0; i < 2; i++) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(PAD + i * (half + PAD), PAD, half, PHOTO_H - PAD, 24);
            ctx.clip();
            ctx.drawImage(imgs[i], PAD + i * (half + PAD), PAD, half, PHOTO_H - PAD);
            ctx.restore();
          }
        } else {
          const main = (W - PAD * 3) * 0.62;
          const side = W - PAD * 3 - main;
          // 왼쪽 큰 사진
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(PAD, PAD, main, PHOTO_H - PAD, 24);
          ctx.clip();
          ctx.drawImage(imgs[0], PAD, PAD, main, PHOTO_H - PAD);
          ctx.restore();
          // 오른쪽 두 사진
          const halfH = (PHOTO_H - PAD * 3) / 2;
          for (let i = 0; i < 2; i++) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(PAD * 2 + main, PAD + i * (halfH + PAD), side, halfH, 20);
            ctx.clip();
            ctx.drawImage(imgs[i + 1], PAD * 2 + main, PAD + i * (halfH + PAD), side, halfH);
            ctx.restore();
          }
        }
      } catch { /* 이미지 로드 실패 무시 */ }

      // 사진 위 그라디언트 오버레이
      const photoOverlay = ctx.createLinearGradient(0, PHOTO_H * 0.6, 0, PHOTO_H);
      photoOverlay.addColorStop(0, "rgba(26,26,46,0)");
      photoOverlay.addColorStop(1, "rgba(26,26,46,0.92)");
      ctx.fillStyle = photoOverlay;
      ctx.fillRect(0, 0, W, PHOTO_H + PAD);
    }

    // ── 골드 구분선 ───────────────────────────────────────────
    const lineY = Math.round(H * 0.60);
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth   = 2.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(60, lineY);
    ctx.lineTo(W - 60, lineY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── 텍스트 섹션 ───────────────────────────────────────────
    let y = lineY + 60;

    // 퍼스낼리티 배지
    ctx.fillStyle = "#D4AF37";
    ctx.font      = "bold 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${personality.emoji}  ${personality.title}`, W / 2, y);
    y += 52;

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font      = "400 30px system-ui, sans-serif";
    const descLines = wrapText(ctx, personality.desc, W - 120);
    for (const line of descLines) {
      ctx.fillText(line, W / 2, y);
      y += 40;
    }
    y += 30;

    // 도시 제목
    const cityCap = city.charAt(0).toUpperCase() + city.slice(1);
    ctx.fillStyle = "#ffffff";
    ctx.font      = "black 90px system-ui, sans-serif";
    ctx.fillText(`My ${cityCap} Trip`, W / 2, y);
    y += 100;

    // 날짜
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font      = "500 34px system-ui, sans-serif";
    ctx.fillText(`${startDate}  →  ${endDate}`, W / 2, y);
    y += 70;

    // 통계 칩
    const stats = [
      `${dayCount} Days`,
      `${placeCount} Spots`,
      moments.length > 0 ? `${moments.length} Memories` : null,
    ].filter(Boolean) as string[];

    const chipY   = y;
    const chipW   = 220;
    const chipGap = 18;
    const totalW  = stats.length * chipW + (stats.length - 1) * chipGap;
    let  chipX    = (W - totalW) / 2;

    for (const stat of stats) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.roundRect(chipX, chipY - 40, chipW, 60, 18);
      ctx.fill();
      ctx.fillStyle = "#D4AF37";
      ctx.font      = "bold 30px system-ui, sans-serif";
      ctx.fillText(stat, chipX + chipW / 2, chipY);
      chipX += chipW + chipGap;
    }
    y = chipY + 60;

    // 메모 미리보기 (첫 번째 메모)
    const firstMemo = moments.find(m => m.memo)?.memo;
    if (firstMemo) {
      y += 40;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(60, y, W - 120, 140, 20);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font      = "400 italic 28px system-ui, sans-serif";
      ctx.textAlign = "left";
      const memoLines = wrapText(ctx, `"${firstMemo.slice(0, 80)}${firstMemo.length > 80 ? "…" : ""}"`, W - 160);
      let my = y + 46;
      for (const line of memoLines.slice(0, 3)) {
        ctx.fillText(line, 80, my);
        my += 38;
      }
      ctx.textAlign = "center";
      y += 160;
    }

    // ── 워터마크 ──────────────────────────────────────────────
    ctx.fillStyle = "rgba(212,175,55,0.8)";
    ctx.font      = "bold 32px system-ui, sans-serif";
    ctx.fillText("gokoreamate.com", W / 2, H - 70);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font      = "400 26px system-ui, sans-serif";
    ctx.fillText("Plan your Korea trip →", W / 2, H - 30);

    setRendering(false);
    setRendered(true);
  }, [moments, city, startDate, endDate, dayCount, placeCount, travelStyle, personality]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `korea-trip-${city}-${startDate}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [city, startDate]);

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

        {/* 액션 버튼 */}
        <div className="px-5 pb-6 space-y-3">
          {!rendered ? (
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
              <button
                onClick={handleDownload}
                className="w-full py-3.5 rounded-xl text-sm font-black text-[#1a1a2e] transition-all active:scale-95 cursor-pointer"
                style={{ backgroundColor: "#D4AF37" }}
              >
                ⬇️ PNG 저장 (Instagram / TikTok)
              </button>
              <button
                onClick={render}
                className="w-full py-3 rounded-xl text-xs font-bold text-white/50 hover:text-white transition-colors cursor-pointer"
              >
                다시 생성
              </button>
            </>
          )}
          <p className="text-center text-[10px] text-white/25">
            9:16 · Instagram Stories · TikTok · X 최적화
          </p>
        </div>
      </div>
    </div>
  );
}
