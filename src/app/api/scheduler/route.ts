// GoKoreaMate / gokoreamate.com — POST /api/scheduler
// TASK-013: Rule-based Scheduler v1
// Returns a ScheduledDay or a ConflictError (HTTP 409).

import { NextRequest, NextResponse } from "next/server";
import { runScheduler, MOCK_SCHEDULER_INPUT } from "@/lib/scheduler/index";
import type { SchedulerInput } from "@/lib/scheduler/index";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Mock-first: bypass real input when env flag is set
  const useMock =
    process.env.NEXT_PUBLIC_USE_MOCK_SCHEDULER === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_SCHEDULER === "1";

  let input: SchedulerInput;

  if (useMock) {
    input = MOCK_SCHEDULER_INPUT;
  } else {
    try {
      input = (await req.json()) as SchedulerInput;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
  }

  const result = runScheduler(input);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.message, conflict: result.error },
      { status: 409 }
    );
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}
