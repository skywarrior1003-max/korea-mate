import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, string>;

  const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "km-admin-2026";
  if (body.key !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { place_id } = body;
  if (!place_id || !/^[a-zA-Z0-9\-_]+$/.test(place_id)) {
    return NextResponse.json({ error: "Invalid place_id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!supabaseUrl) {
    return NextResponse.json({ error: "SUPABASE_URL missing" }, { status: 500 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: "TOKEN_MISSING" }, { status: 503 });
  }

  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
  // place_id validated above (alphanum + hyphens/underscores only)
  const sql = `
    DELETE FROM spot_reactions WHERE place_id = '${place_id}';
    DELETE FROM spots WHERE place_id = '${place_id}';
  `.trim();

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  ).catch((err: Error) => { throw new Error(`Network error: ${err.message}`); });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: (data as { message?: string })?.message ?? `HTTP ${res.status}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
