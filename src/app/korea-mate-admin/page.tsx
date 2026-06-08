"use client";

import { useState, useCallback, useRef } from "react";
import { bulkUpsertSpots, csvRowToSpot, type SpotRow } from "@/lib/spots";

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "km-admin-2026";

type MigrateStatus = "idle" | "running" | "ok" | "token_missing" | "error";

// ── CSV 파서 (quoted fields 지원) ─────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        result.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

// ══════════════════════════════════════════════════════════════
export default function AdminPage() {
  const [authed,        setAuthed]        = useState(false);
  const [pw,            setPw]            = useState("");
  const [pwError,       setPwError]       = useState(false);

  const [migrateStatus, setMigrateStatus] = useState<MigrateStatus>("idle");
  const [migrateMsg,    setMigrateMsg]    = useState("");

  const [csvText,       setCsvText]       = useState("");
  const [headers,       setHeaders]       = useState<string[]>([]);
  const [preview,       setPreview]       = useState<Record<string, string>[]>([]);
  const [parsed,        setParsed]        = useState<SpotRow[]>([]);
  const [parseError,    setParseError]    = useState<string | null>(null);

  const [uploading,     setUploading]     = useState(false);
  const [result,        setResult]        = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── DB 자동 초기화 ────────────────────────────────────────
  async function runMigration() {
    setMigrateStatus("running");
    setMigrateMsg("");
    try {
      const res = await fetch("/api/admin/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: ADMIN_KEY }),
      });
      const data = await res.json() as { success?: boolean; error?: string; message?: string };
      if (data.success) {
        setMigrateStatus("ok");
        setMigrateMsg("spots 테이블 생성 완료");
      } else if (data.error === "TOKEN_MISSING") {
        setMigrateStatus("token_missing");
        setMigrateMsg(data.message ?? "");
      } else {
        setMigrateStatus("error");
        setMigrateMsg(data.message ?? data.error ?? "알 수 없는 오류");
      }
    } catch (err) {
      setMigrateStatus("error");
      setMigrateMsg((err as Error).message);
    }
  }

  // ── 패스워드 인증 ──────────────────────────────────────────
  function handleLogin() {
    if (pw === ADMIN_KEY) {
      setAuthed(true);
      setPwError(false);
      runMigration(); // 로그인 시 자동 실행
    } else {
      setPwError(true);
    }
  }

  // ── CSV 파일 처리 ──────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      parseCsvText(text);
    };
    reader.readAsText(file, "UTF-8");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function parseCsvText(text: string) {
    setParseError(null);
    setResult(null);
    try {
      const { headers: h, rows } = parseCSV(text);
      if (!h.length) { setParseError("CSV 헤더를 읽을 수 없습니다."); return; }
      setHeaders(h);
      setPreview(rows.slice(0, 5));

      const spots: SpotRow[] = [];
      const errs: string[] = [];
      rows.forEach((row, i) => {
        const partial = csvRowToSpot(row);
        if (!partial.place_id || !partial.title || !partial.category) {
          errs.push(`Row ${i + 2}: place_id, title, category 필수 — 건너뜀`);
          return;
        }
        spots.push(partial as SpotRow);
      });
      if (errs.length) setParseError(errs.join("\n"));
      setParsed(spots);
    } catch (err) {
      setParseError(`파싱 에러: ${(err as Error).message}`);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) handleFile(file);
  }

  async function handleUpload() {
    if (!parsed.length) return;
    setUploading(true);
    setResult(null);
    const res = await bulkUpsertSpots(parsed);
    setResult(res);
    setUploading(false);
  }

  // ─────────────────────────────────────────────────────────────
  //  RENDER — 패스워드 게이트
  // ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm border border-gray-700 shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-4xl">🔐</span>
            <h1 className="text-xl font-black text-white mt-3">KoreaMate Admin</h1>
            <p className="text-gray-400 text-sm mt-1">비공개 관리자 전용</p>
          </div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="어드민 패스워드"
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm font-semibold placeholder:text-gray-500 focus:outline-none focus:border-orange-500 mb-3"
          />
          {pwError && <p className="text-red-400 text-xs mb-3 font-bold">패스워드가 틀렸습니다.</p>}
          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-xl font-black text-sm text-white"
            style={{ backgroundColor: "#f97316" }}
          >
            로그인
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  RENDER — 메인 어드민 화면
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">🛠️ KoreaMate Admin</h1>
            <p className="text-gray-400 text-sm mt-1">CSV 일괄 업로더 — Supabase spots 테이블 동기화</p>
          </div>
          <button
            onClick={() => setAuthed(false)}
            className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg"
          >
            로그아웃
          </button>
        </div>

        {/* STEP 1: DB 자동 초기화 */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700">
          <h2 className="text-base font-black mb-1 text-orange-400">① 데이터베이스 자동 초기화</h2>
          <p className="text-gray-400 text-xs mb-4">
            로그인 시 자동 실행됩니다. spots 테이블이 없으면 생성, 있으면 재생성합니다.
          </p>

          {/* 상태 표시 */}
          {migrateStatus === "running" && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-900/30 border border-blue-700 mb-4">
              <span className="text-xl animate-spin">⚙️</span>
              <p className="text-blue-300 text-sm font-bold">테이블 생성 중...</p>
            </div>
          )}
          {migrateStatus === "ok" && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-900/30 border border-green-700 mb-4">
              <span className="text-xl">✅</span>
              <p className="text-green-300 text-sm font-bold">{migrateMsg}</p>
            </div>
          )}
          {migrateStatus === "token_missing" && (
            <div className="p-4 rounded-xl bg-yellow-900/30 border border-yellow-700 mb-4">
              <p className="text-yellow-300 text-sm font-black mb-2">⚠️ SUPABASE_ACCESS_TOKEN 미설정</p>
              <p className="text-yellow-200 text-xs leading-relaxed">
                1. <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener" className="underline">supabase.com/dashboard/account/tokens</a> 에서 토큰 생성<br />
                2. <code className="bg-gray-800 px-1 rounded">.env.local</code>에 추가: <code className="bg-gray-800 px-1 rounded">SUPABASE_ACCESS_TOKEN=your_token</code><br />
                3. 개발 서버 재시작 후 아래 버튼 클릭
              </p>
            </div>
          )}
          {migrateStatus === "error" && (
            <div className="p-4 rounded-xl bg-red-900/30 border border-red-700 mb-4">
              <p className="text-red-400 text-sm font-black mb-1">❌ 초기화 실패</p>
              <p className="text-red-300 text-xs break-all">{migrateMsg}</p>
            </div>
          )}

          <button
            onClick={runMigration}
            disabled={migrateStatus === "running"}
            className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: migrateStatus === "ok" ? "#16a34a" : "#7c3aed" }}
          >
            {migrateStatus === "running"
              ? "⏳ 실행 중..."
              : migrateStatus === "ok"
              ? "✅ 초기화 완료 (재실행)"
              : "🚀 데이터베이스 자동 초기화"}
          </button>
        </div>

        {/* STEP 2: CSV 형식 안내 */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700">
          <h2 className="text-base font-black mb-1 text-orange-400">② CSV 헤더 형식</h2>
          <p className="text-gray-400 text-xs mb-3">
            헤더 이름은 대소문자·언더스코어 무관하게 파싱됩니다.
            <strong className="text-white"> place_id, title, category 3개는 필수</strong>입니다.
          </p>
          <div className="overflow-x-auto">
            <table className="text-[11px] text-gray-300 border-collapse w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  {["place_id*", "title*", "category*", "description", "image_url",
                    "difficulty", "duration_min", "required_gear", "affiliate_url"].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-gray-400 font-bold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
                <tr>
                  {[
                    "busan-haeundae",
                    "Haeundae Beach",
                    "attraction",
                    "Korea's most famous beach",
                    "https://images.unsplash.com/...",
                    "easy",
                    "120",
                    "Comfortable shoes",
                    "https://affiliate.klook.com/...",
                  ].map((v, i) => (
                    <td key={i} className="px-2 py-1 text-[10px] text-gray-500 whitespace-nowrap">{v}</td>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
        </div>

        {/* STEP 3: 파일 업로드 */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700">
          <h2 className="text-base font-black mb-4 text-orange-400">③ CSV 파일 업로드</h2>

          <div
            className="border-2 border-dashed border-gray-600 rounded-xl p-10 text-center cursor-pointer hover:border-orange-500 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <p className="text-3xl mb-3">📂</p>
            <p className="text-sm font-bold text-gray-300">CSV 파일을 여기에 드래그하거나 클릭해서 선택</p>
            <p className="text-xs text-gray-500 mt-1">UTF-8 인코딩 권장</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {csvText && (
            <p className="text-xs text-green-400 mt-3 font-bold">
              ✅ 파일 로드 완료 — {parsed.length}개 레코드 파싱됨
              {parseError ? ` (경고: ${parseError.split("\n").length}건)` : ""}
            </p>
          )}
        </div>

        {/* STEP 4: 프리뷰 */}
        {preview.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700">
            <h2 className="text-base font-black mb-4 text-orange-400">④ 파싱 미리보기 (최대 5행)</h2>
            <div className="overflow-x-auto">
              <table className="text-[11px] text-gray-300 border-collapse w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    {headers.map(h => (
                      <th key={h} className="px-2 py-1.5 text-left text-gray-400 font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-gray-800">
                      {headers.map(h => (
                        <td key={h} className="px-2 py-1.5 whitespace-nowrap text-gray-400 max-w-[180px] truncate">
                          {row[h] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parseError && (
              <div className="mt-3 p-3 rounded-xl bg-yellow-900/30 border border-yellow-700">
                <p className="text-yellow-400 text-xs font-black mb-1">⚠️ 파싱 경고</p>
                <pre className="text-yellow-300 text-[10px] whitespace-pre-wrap">{parseError}</pre>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: 업로드 실행 */}
        {parsed.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700">
            <h2 className="text-base font-black mb-2 text-orange-400">⑤ Supabase 일괄 업로드</h2>
            <p className="text-gray-400 text-xs mb-5">
              <strong className="text-white">{parsed.length}개</strong> 레코드를{" "}
              <code className="text-orange-300">spots</code> 테이블에 Upsert합니다.
              place_id가 같으면 덮어씁니다.
            </p>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-8 py-4 rounded-xl font-black text-base text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#f97316" }}
            >
              {uploading ? "⏳ 업로드 중..." : `🚀 ${parsed.length}개 Supabase 동기화`}
            </button>

            {result && (
              <div className={`mt-5 p-5 rounded-xl border ${result.failed === 0 ? "bg-green-900/30 border-green-700" : "bg-yellow-900/30 border-yellow-700"}`}>
                <p className={`text-base font-black mb-1 ${result.failed === 0 ? "text-green-400" : "text-yellow-400"}`}>
                  {result.failed === 0 ? "✅ 전체 성공!" : "⚠️ 일부 실패"}
                </p>
                <p className="text-sm text-gray-300">
                  성공: <strong className="text-green-400">{result.success}건</strong>
                  {result.failed > 0 && (
                    <> · 실패: <strong className="text-red-400">{result.failed}건</strong></>
                  )}
                </p>
                {result.errors.length > 0 && (
                  <pre className="mt-3 text-[10px] text-red-300 whitespace-pre-wrap">{result.errors.join("\n")}</pre>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-700 pb-6">
          KoreaMate Admin · 비공개 · 외부 공유 금지
        </p>
      </div>
    </div>
  );
}
