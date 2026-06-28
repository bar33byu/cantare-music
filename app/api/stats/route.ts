import { NextRequest, NextResponse } from "next/server";
import { getPracticeStatsSummary } from "../../../db/queries";
import { resolveEffectiveRequestUserId } from "../_user";

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const stats = await getPracticeStatsSummary(userId);
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error loading stats:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
