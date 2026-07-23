import { MagicCodeSignInForm } from "../../../components/MagicCodeSignInForm";

interface SharedPlaylistSignInProps {
  returnTo: string;
}

export function SharedPlaylistSignIn({ returnTo }: SharedPlaylistSignInProps) {
  return (
    <MagicCodeSignInForm
      idPrefix="shared-playlist-sign-in"
      returnTo={returnTo}
      className="sm:min-w-80"
      footer="Your code or login link will bring you back here to import this playlist."
    />
  );
}
