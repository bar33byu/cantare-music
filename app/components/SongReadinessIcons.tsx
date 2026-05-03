import type { ReactNode } from 'react';

interface SongReadinessIconsProps {
  hasAudio: boolean;
  hasSegments: boolean;
  hasTapKeys: boolean;
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

export function SongReadinessIcons({ hasAudio, hasSegments, hasTapKeys, testIdPrefix }: SongReadinessIconsProps) {
  return (
    <div
      className="inline-flex items-center gap-1"
      data-testid={testIdPrefix ? `${testIdPrefix}-readiness` : undefined}
    >
      <ReadinessDot
        enabled={hasAudio}
        title={hasAudio ? 'Audio file present' : 'Audio file missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-audio` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15 9a5 5 0 0 1 0 6" />
        </svg>
      </ReadinessDot>

      <ReadinessDot
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
        enabled={hasTapKeys}
        title={hasTapKeys ? 'Tap keys present' : 'Tap keys missing'}
        testId={testIdPrefix ? `${testIdPrefix}-readiness-tapkeys` : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14c1.5 0 1.5-4 3-4s1.5 8 3 8 1.5-12 3-12 1.5 8 3 8 1.5-4 3-4" />
        </svg>
      </ReadinessDot>
    </div>
  );
}
