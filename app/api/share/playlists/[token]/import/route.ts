import { NextRequest, NextResponse } from "next/server";
import { importSharedPlaylist } from "../../../../../../db/queries";
import { resolveRequestContext } from "../../../../_user";

function playlistRedirectUrl(request: NextRequest, playlistId: string): URL {
  const url = new URL("/", request.url);
  const params = new URLSearchParams();
  params.set("view", "playlist_detail");
  params.set("playlist", playlistId);
  url.hash = params.toString();
  return url;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const context = await resolveRequestContext(request);
  const user = context.effectiveUser;
  if (!context.actor || !user || !(context.actor.email ?? "").trim()) {
    return NextResponse.json({ error: "Sign in to import this playlist." }, { status: 401 });
  }

  const { token } = await params;
  const formData = await request.formData().catch(() => null);
  const force = formData?.get("force") === "true" || new URL(request.url).searchParams.get("force") === "true";

  try {
    const result = await importSharedPlaylist(token, user.id, { force });
    return NextResponse.redirect(playlistRedirectUrl(request, result.playlist.id), 303);
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === "SHARED_PLAYLIST_NOT_FOUND") {
      return NextResponse.json({ error: "Shared playlist not found." }, { status: 404 });
    }
    console.error("Error importing shared playlist:", error);
    return NextResponse.json({ error: "Unable to import this playlist right now." }, { status: 500 });
  }
}
