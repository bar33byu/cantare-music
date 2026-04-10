import { PitchContourNote } from '../types';

interface PitchContourThumbnailProps {
  notes?: PitchContourNote[];
  segmentDurationMs: number;
  className?: string;
}

export function PitchContourThumbnail({ notes = [], segmentDurationMs, className }: PitchContourThumbnailProps) {
  const safeDurationMs = Math.max(1, segmentDurationMs);

  return (
    <div
      data-testid="pitch-contour-thumbnail"
      className={[
        'h-10 w-full overflow-hidden rounded border border-indigo-200 bg-indigo-50/50',
        className ?? '',
      ].join(' ').trim()}
    >
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-full w-full">
        <rect x="0" y="11.5" width="100" height="1" fill="rgb(165 180 252)" />
        {notes.length === 0 ? null : notes.map((note) => {
          const x = Math.max(0, Math.min(100, (note.timeOffsetMs / safeDurationMs) * 100));
          const width = Math.max(1, Math.min(100 - x, (note.durationMs / safeDurationMs) * 100));
          const y = (1 - note.lane) * 20;

          return (
            <rect
              key={note.id}
              data-testid="pitch-contour-thumbnail-note"
              x={x}
              y={Math.max(0, Math.min(20, y))}
              width={width}
              height={4}
              rx={1}
              fill="rgb(79 70 229)"
              opacity="0.85"
            />
          );
        })}
      </svg>
    </div>
  );
}
