interface AppBuildBadgeProps {
  version: string;
  branch: string;
  commitSha?: string;
}

export function AppBuildBadge({ version, branch, commitSha }: AppBuildBadgeProps) {
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;

  return (
    <div
      data-testid="app-build-badge"
      className="fixed right-2 top-2 z-[100] rounded-full border border-slate-300 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur"
      title={shortSha ? `v${version} | ${branch} | ${shortSha}` : `v${version} | ${branch}`}
    >
      <span>v{version}</span>
      <span className="mx-1 text-slate-400">|</span>
      <span>{branch}</span>
      {shortSha ? (
        <>
          <span className="mx-1 text-slate-400">|</span>
          <span>{shortSha}</span>
        </>
      ) : null}
    </div>
  );
}
