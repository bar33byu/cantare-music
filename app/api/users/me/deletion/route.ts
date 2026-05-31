import { NextRequest, NextResponse } from "next/server";
import {
  cancelUserAccountDeletion,
  getUserAccountDeletionStatus,
  logAuditEvent,
  scheduleUserAccountDeletion,
} from "../../../../../db/queries";
import { getAccountDeletionScheduleDates } from "../../../../lib/accountDeletion";
import { resolveRequestContext } from "../../../_user";

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

function ensureSelfManagedAccount(context: Awaited<ReturnType<typeof resolveRequestContext>>) {
  if (!context.effectiveUser?.email?.trim()) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (context.isImpersonating || (context.actor && context.effectiveUser && context.actor.id !== context.effectiveUser.id)) {
    return NextResponse.json({ error: "Exit impersonation to manage account deletion" }, { status: 403 });
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    const authError = ensureSelfManagedAccount(context);
    if (authError) {
      return authError;
    }

    const status = await getUserAccountDeletionStatus(context.effectiveUser!.id);
    return NextResponse.json({
      deletion: status ?? { requestedAt: null, scheduledFor: null },
    });
  } catch (error) {
    console.error("Error fetching account deletion status:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    const authError = ensureSelfManagedAccount(context);
    if (authError) {
      return authError;
    }

    const existing = await getUserAccountDeletionStatus(context.effectiveUser!.id);
    if (existing?.scheduledFor) {
      return NextResponse.json({ deletion: existing });
    }

    const { requestedAt, scheduledFor } = getAccountDeletionScheduleDates();
    const deletion = await scheduleUserAccountDeletion(context.effectiveUser!.id, requestedAt, scheduledFor);
    if (!deletion) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await logAuditEvent({
      eventType: "user.account_deletion_scheduled",
      actorUserId: context.actor?.id ?? context.effectiveUser!.id,
      effectiveUserId: context.effectiveUser!.id,
      resourceType: "user",
      resourceId: context.effectiveUser!.id,
      metadata: {
        scheduledFor: deletion.scheduledFor,
      },
    });

    return NextResponse.json({ deletion });
  } catch (error) {
    console.error("Error scheduling account deletion:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    const authError = ensureSelfManagedAccount(context);
    if (authError) {
      return authError;
    }

    const deletion = await cancelUserAccountDeletion(context.effectiveUser!.id);
    if (!deletion) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await logAuditEvent({
      eventType: "user.account_deletion_canceled",
      actorUserId: context.actor?.id ?? context.effectiveUser!.id,
      effectiveUserId: context.effectiveUser!.id,
      resourceType: "user",
      resourceId: context.effectiveUser!.id,
    });

    return NextResponse.json({ deletion });
  } catch (error) {
    console.error("Error canceling account deletion:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
