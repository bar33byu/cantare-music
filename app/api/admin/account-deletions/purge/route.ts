import { NextRequest, NextResponse } from "next/server";
import { getUsersPendingAccountDeletion, logAuditEvent } from "../../../../../db/queries";
import { purgeUserAccount } from "../../../../lib/accountDeletion";
import { resolveRequestContext } from "../../../_user";

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const shouldExpose =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEBUG_API_ERRORS === "true";

  return shouldExpose ? { error: message } : { error: "Internal server error" };
}

function hasValidCronSecret(request: NextRequest): boolean {
  const configuredSecret = process.env.CANTARE_ACCOUNT_DELETION_CRON_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${configuredSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveRequestContext(request);
    const authorizedBySecret = hasValidCronSecret(request);
    const authorizedByAdmin = Boolean(context.actor?.isAdmin);

    if (!authorizedBySecret && !authorizedByAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dueUsers = await getUsersPendingAccountDeletion(new Date());
    const results: Array<{ userId: string; deleted: boolean; failedStorageKeyCount: number }> = [];

    for (const user of dueUsers) {
      const result = await purgeUserAccount(user.id);
      if (result.deleted) {
        await logAuditEvent({
          eventType: "user.account_purged",
          actorUserId: authorizedByAdmin ? context.actor?.id ?? null : null,
          effectiveUserId: user.id,
          resourceType: "user",
          resourceId: user.id,
          metadata: {
            triggeredBy: authorizedBySecret ? "cron" : "admin",
            failedStorageKeyCount: result.failedStorageKeys.length,
          },
        });
      }

      results.push({
        userId: user.id,
        deleted: result.deleted,
        failedStorageKeyCount: result.failedStorageKeys.length,
      });
    }

    return NextResponse.json({
      processedCount: results.length,
      results,
    });
  } catch (error) {
    console.error("Error purging scheduled account deletions:", error);
    return NextResponse.json(formatError(error), { status: 500 });
  }
}
