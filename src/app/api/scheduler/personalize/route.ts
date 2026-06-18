// GoKoreaMate / gokoreamate.com — POST /api/scheduler/personalize
// TASK-014: AI Personalization Layer
// Returns PersonalizedScheduledDay (ai_used: true) on success,
// ScheduledDay (ai_used: false) on AI fallback (both HTTP 200),
// or { error, conflict } (HTTP 409) on hard constraint violation.

import { NextRequest, NextResponse } from "next/server";
import { personalize } from "@/lib/scheduler/ai/personalizer";
import type { SchedulerInput } from "@/lib/scheduler/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let input: SchedulerInput;

  try {
    input = (await req.json()) as SchedulerInput;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = await personalize(input);

  switch (result.kind) {
    case "personalized":
      return NextResponse.json({ data: result.data }, { status: 200 });

    case "fallback":
      // AI failed but rule-based schedule is valid — return as-is with HTTP 200.
      // Client distinguishes via data.ai_used === false.
      return NextResponse.json({ data: result.data }, { status: 200 });

    case "conflict":
      return NextResponse.json(
        { error: result.error.message, conflict: result.error },
        { status: 409 }
      );
  }
}
