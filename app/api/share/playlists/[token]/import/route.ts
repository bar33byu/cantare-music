import { NextRequest, NextResponse } from "next/server";
import { importSharedPlaylist } from "../../../../../../db/queries";
import { resolveRequestContext } from "../../../../_user";

const sharedHeaders = {
  "Cache-Control": "private, no-store",
};

function playlistRedirectPath(playlistId: string): string {
  const params = new URLSearchParams();
  params.set("view", "playlist_detail");
  params.set("playlist", playlistId);
  return `/#${params.toString()}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const context = await resolveRequestContext(request);
  const user = context.effectiveUser;
  if (!context.actor || !user || !(context.actor.email ?? "").trim()) {
    return NextResponse.json({ error: "Sign in to import this playlist." }, { status: 401, headers: sharedHeaders });
  }

  const { token } = await params;
  const requestUrl = new URL(request.url);
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json().catch(() => ({})) as { force?: unknown }
    : null;
  const formData = body ? null : await request.formData().catch(() => null);
  const force =
    body?.force === true ||
    formData?.get("force") === "true" ||
    requestUrl.searchParams.get("force") === "true";

  try {
    const result = await importSharedPlaylist(token, user.id, { force });
    return NextResponse.json(
      {
        ...result,
        redirectTo: playlistRedirectPath(result.playlist.id),
      },
      { headers: sharedHeaders }
    );
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === "SHARED_PLAYLIST_NOT_FOUND") {
      return NextResponse.json({ error: "Shared playlist not found." }, { status: 404, headers: sharedHeaders });
    }
    console.error("Error importing shared playlist:", error);
    return NextResponse.json({ error: "Unable to import this playlist right now." }, { status: 500, headers: sharedHeaders });
  }
}
