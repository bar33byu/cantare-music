import type { ReactNode } from 'react';

interface SongReadinessIconsProps {
  hasPartAudio: boolean;
  hasBlendAudio: boolean;
  hasSegments: boolean;
  hasMidiContour: boolean;
  testIdPrefix?: string;
  showLabels?: boolean;
}

function ReadinessDot({
  enabled,
  title,
  testId,
  children,
  showLabels,
  label,
}: {
  enabled: boolean;
  title: string;
  testId?: string;
  children: ReactNode;
  label: string;
  showLabels?: boolean;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      data-testid={testId}
      className={[
        showLabels
          ? 'inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium'
          : 'inline-flex h-5 w-5 items-center justify-center rounded-full border',
        enabled
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-600',
      ].join(' ')}
    >
      {children}
      {showLabels ? <span>{label}{enabled ? '' : ': not added'}</span> : null}
    </span>
  );
}

export function SongReadinessIcons({ hasPartAudio, hasBlendAudio, hasSegments, hasMidiContour, testIdPrefix, showLabels = false }: SongReadinessIconsProps) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-1"
      data-testid={testIdPrefix ? `${testIdPrefix}-readiness` : undefined}
    >
      <ReadinessDot
        showLabels={showLabels}
        label="Part"
        enabled={hasPartAudio}
        title={hasPartAudio ? 'Part audio present' : 'Part audio missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-part-audio` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15 9a5 5 0 0 1 0 6" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
        showLabels={showLabels}
        label="Blend"
        enabled={hasBlendAudio}
        title={hasBlendAudio ? 'Blend audio present' : 'Blend audio missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-blend-audio` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h5l5 8h6" />
          <path d="M4 16h5l5-8h6" />
          <path d="M18 5l3 3-3 3" />
          <path d="M18 13l3 3-3 3" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
        showLabels={showLabels}
        label="Sections"
        enabled={hasSegments}
        title={hasSegments ? 'Sections present' : 'Sections missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-segments` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
        showLabels={showLabels}
        label="MIDI contour"
        enabled={hasMidiContour}
        title={hasMidiContour ? 'MIDI contour present' : 'MIDI contour missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-midi-contour` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14c1.5 0 1.5-4 3-4s1.5 8 3 8 1.5-12 3-12 1.5 8 3 8 1.5-4 3-4" />
        </svg>
      </ReadinessDot>
    </div>
  );
}
