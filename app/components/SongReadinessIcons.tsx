import type { ReactNode } from 'react';

interface SongReadinessIconsProps {
  hasPartAudio: boolean;
  hasBlendAudio: boolean;
  hasSegments: boolean;
  hasMidiContour: boolean;
  testIdPrefix?: string;
}

function ReadinessDot({
  enabled,
  title,
  testId,
  children,
}: {
  enabled: boolean;
  title: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      data-testid={testId}
      className={[
        'inline-flex h-5 w-5 items-center justify-center rounded-full border',
        enabled
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-rose-300 bg-rose-50 text-rose-700',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

export function SongReadinessIcons({ hasPartAudio, hasBlendAudio, hasSegments, hasMidiContour, testIdPrefix }: SongReadinessIconsProps) {
  return (
    <div
      className="inline-flex items-center gap-1"
      data-testid={testIdPrefix ? `${testIdPrefix}-readiness` : undefined}
    >
      <ReadinessDot
        enabled={hasPartAudio}
        title={hasPartAudio ? 'Part audio present' : 'Part audio missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-part-audio` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <path d="M12 17v4" />
          <path d="M8 21h8" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
        enabled={hasBlendAudio}
        title={hasBlendAudio ? 'Blend audio present' : 'Blend audio missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-blend-audio` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
        enabled={hasSegments}
        title={hasSegments ? 'Lyrics and sections present' : 'Lyrics and sections missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-segments` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 5h2" />
          <path d="M5 12h2" />
          <path d="M5 19h2" />
          <path d="M10 5h9" />
          <path d="M10 12h9" />
          <path d="M10 19h9" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
        enabled={hasMidiContour}
        title={hasMidiContour ? 'MIDI melodic contour present' : 'MIDI melodic contour missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-midi-contour` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="m6 15 3-4 3 2 4-6 2 2" />
        </svg>
      </ReadinessDot>
    </div>
  );
}
