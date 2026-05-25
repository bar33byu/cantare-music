import { NextRequest, NextResponse } from "next/server";
import { getAllUsers } from "../../../../db/queries";
import { isEmailAdmin, resolveRequestContext } from "../../_user";

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

    const users = await getAllUsers();
    return NextResponse.json({
      actor: context.actor,
      effectiveUser: context.effectiveUser,
      users: users.map((user) => ({ ...user, isAdmin: isEmailAdmin(user.email) })),
    });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
