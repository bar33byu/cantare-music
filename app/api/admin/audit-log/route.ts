import { NextRequest, NextResponse } from "next/server";
import { listAuditLogsForTroubleshooting } from "../../../../db/queries";
import { resolveRequestContext } from "../../_user";

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

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
