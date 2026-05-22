import HomeClient from "./HomeClient";
import packageJson from "../package.json";

export default function Page() {
  return (
    <HomeClient
      buildInfo={{
        version: packageJson.version,
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_APP_BRANCH ?? "local",
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      }}
    />
  );
}
