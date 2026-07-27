// GoKoreaMate — Trip Cover 세로 공유 카드 (1080×1920)
//
// 사진 밴드형. 원본 자산이 최대 940×706 이라 세로 풀블리드로 쓰면 약 3배 확대가
// 필요해 화질이 무너진다. 상단 40% 밴드(1080×768)만 사용하면 940→1080 = 1.15배로
// 끝나므로 선명도가 유지된다.
//
// 이미지 소스는 반드시 같은 출처 프록시(/img/cover/:assetId).
// 원본(tong.visitkorea.or.kr)은 CORS 헤더가 없어 Canvas 가 오염되고 toBlob 이 실패한다.
//
// 생성된 PNG 는 서버·Storage 에 업로드하지 않는다. Web Share 또는 다운로드 전용.

import { THEME_LABEL } from "./cover-core";
import type { CoverTheme } from "./cover-core";

export interface ShareCardInput {
  coverSrc:      string;        // /img/cover/:assetId — 같은 출처만 허용
  theme:         CoverTheme;
  title:         string;
  city:          string;
  startDate:     string;
  endDate:       string;
  days:          number;
  places:        number;
  neighborhoods: number;
  copyCount:     number;
  helpfulCount:  number;
  attribution:   string;        // "Photo: Korea Tourism Organization"
}

const W = 1080, H = 1920;
const BAND_H = Math.round(H * 0.40);        // 768 — 사양의 38~42% 범위
const INK = "#191C21", CORAL = "#FF4A2D";
const PAD = 72;

const font = (weight: number | string, size: number) =>
  `${weight} ${size}px system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif`;

function fitLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of Array.from(text)) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = ch;
      if (out.length === maxLines) break;
    } else line = test;
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines) {
    const consumed = out.join("").length;
    if (text.length > consumed) {
      let last = out[maxLines - 1] ?? "";
      while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
      out[maxLines - 1] = last + "…";
    }
  }
  return out;
}

function loadSameOrigin(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    // 같은 출처만 허용 — 외부 원본이 실수로 들어오면 그리지 않는다
    if (!src.startsWith("/")) { resolve(null); return; }
    const img = new Image();
    const done = (v: HTMLImageElement | null) => resolve(v);
    img.onload  = () => done(img);
    img.onerror = () => done(null);
    setTimeout(() => done(null), 12000);
    img.src = src;
  });
}

/** 밴드에 cover 크롭 — 과도한 확대를 막기 위해 축소만 하거나 최소 확대만 허용 */
function drawBand(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const scale = Math.max(W / img.naturalWidth, BAND_H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, BAND_H);
  ctx.clip();
  ctx.drawImage(img, (W - dw) / 2, (BAND_H - dh) / 2, dw, dh);
  ctx.restore();
}

/** 밴드 없이도 카드가 성립하도록 하는 브랜드 그라데이션 */
function drawBandFallback(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, W, BAND_H);
  g.addColorStop(0, "#22262C");
  g.addColorStop(0.6, "#2A1D1A");
  g.addColorStop(1, CORAL);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, BAND_H);
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  // ── 상단 사진 밴드 ────────────────────────────────────────────────────────
  const img = await loadSameOrigin(input.coverSrc);
  if (img && img.naturalWidth > 0) drawBand(ctx, img);
  else drawBandFallback(ctx);

  // 밴드 하단 → 정보 영역으로 이어지는 절제된 그라데이션 (우리 고유 처리)
  const fade = ctx.createLinearGradient(0, BAND_H - 220, 0, BAND_H);
  fade.addColorStop(0, "rgba(25,28,33,0)");
  fade.addColorStop(1, INK);
  ctx.fillStyle = fade;
  ctx.fillRect(0, BAND_H - 220, W, 220);

  // 좌측 코랄 레일 — 밴드와 정보 영역을 관통하는 브랜드 장치
  ctx.fillStyle = CORAL;
  ctx.fillRect(0, 0, 12, H);

  // ── 정보 영역 ─────────────────────────────────────────────────────────────
  let y = BAND_H + 96;

  ctx.fillStyle = CORAL;
  ctx.font = font(800, 30);
  ctx.fillText(`${input.city.toUpperCase()}  ·  ${THEME_LABEL[input.theme].toUpperCase()}`, PAD, y);
  y += 78;

  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(800, 78);
  for (const line of fitLines(ctx, input.title, W - PAD * 2, 3)) {
    ctx.fillText(line, PAD, y);
    y += 92;
  }
  y += 10;

  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = font(500, 34);
  ctx.fillText(`${input.startDate}  –  ${input.endDate}`, PAD, y);
  y += 86;

  // 여행 사실 스탬프 3칸 — Copied·Helpful 이 0 이어도 카드가 비지 않게 한다
  const stamps: [string, string][] = [
    [String(input.days),          input.days === 1 ? "DAY" : "DAYS"],
    [String(input.places),        input.places === 1 ? "PLACE" : "PLACES"],
    [String(input.neighborhoods), input.neighborhoods === 1 ? "AREA" : "AREAS"],
  ];
  const colW = (W - PAD * 2) / 3;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(PAD, y - 4, W - PAD * 2, 2);
  y += 74;
  stamps.forEach(([n, label], i) => {
    const cx = PAD + colW * i;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(800, 64);
    ctx.fillText(n, cx, y);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = font(700, 24);
    ctx.fillText(label, cx, y + 40);
  });
  y += 108;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(PAD, y, W - PAD * 2, 2);
  y += 82;

  // 사회적 증거 — 값이 있을 때만
  const proof: string[] = [];
  if (input.copyCount > 0)    proof.push(`Copied ${input.copyCount}×`);
  if (input.helpfulCount > 0) proof.push(`${input.helpfulCount} found it helpful`);
  if (proof.length) {
    ctx.fillStyle = CORAL;
    ctx.font = font(700, 32);
    ctx.fillText(proof.join("   ·   "), PAD, y);
  }

  // ── 푸터 ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = font(800, 32);
  ctx.fillText("gokoreamate.com", PAD, H - 116);

  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font = font(400, 24);
  ctx.fillText("Plan your Korea trip with AI", PAD, H - 76);

  if (input.attribution) {
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.font = font(400, 22);
    ctx.textAlign = "right";
    ctx.fillText(input.attribution, W - PAD, H - 76);
    ctx.textAlign = "left";
  }

  // toBlob 이 SecurityError 를 던지면 오염된 것 — 같은 출처 규칙 위반이다
  return await new Promise<Blob>((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_null"))), "image/png");
  });
}

/** Web Share(files) 지원 시 공유, 미지원이면 다운로드. 서버 업로드 없음. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof navigator !== "undefined" && typeof navigator.share === "function"
      && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch {
      // 사용자가 취소했거나 실패 → 다운로드로 폴백
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
