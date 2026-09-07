import { NextRequest, NextResponse } from "next/server";
import { formatError } from "../../_errors";
import { getAllUsers } from "../../../../db/queries";
import { isEmailAdmin, resolveRequestContext } from "../../_user";

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
