import { NextRequest, NextResponse } from "next/server";
import { formatError } from "../../_errors";
import { listAuditLogsForTroubleshooting } from "../../../../db/queries";
import { resolveRequestContext } from "../../_user";

export async function GET(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    if (!context.actor?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");
    const logs = await listAuditLogsForTroubleshooting(Number.isFinite(limit) ? limit : 100);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
