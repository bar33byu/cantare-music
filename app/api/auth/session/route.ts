import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE_NAME } from "../../../lib/authTokens";
import { getRequestCookie, resolveRequestContext } from "../../_user";

export async function GET(request: NextRequest) {
  if (!getRequestCookie(request, AUTH_SESSION_COOKIE_NAME)) {
    return NextResponse.json({ user: null, actor: null, effectiveUser: null, isImpersonating: false });
  }

  const context = await resolveRequestContext(request);
  return NextResponse.json({
    user: context.effectiveUser,
    actor: context.actor,
    effectiveUser: context.effectiveUser,
    isImpersonating: context.isImpersonating,
  });
}
