import { NextRequest, NextResponse } from "next/server";
import { getPracticeStatsSummary, type PracticeStatsRange } from "../../../db/queries";
import { resolveEffectiveRequestUserId } from "../_user";

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveEffectiveRequestUserId(request);
    const requestedRange = request.nextUrl.searchParams.get("range");
    const range: PracticeStatsRange = requestedRange === "90" || requestedRange === "all" ? requestedRange === "90" ? 90 : "all" : 30;
    const stats = await getPracticeStatsSummary(userId, new Date(), range);
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error loading stats:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
