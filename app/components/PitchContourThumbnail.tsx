import { ContourNoteHeatStat, PitchContourNote } from '../types';

interface PitchContourThumbnailProps {
  notes?: PitchContourNote[];
  segmentDurationMs: number;
  className?: string;
  noteHeatMap?: Record<string, ContourNoteHeatStat>;
  noteResults?: Record<string, 'matched' | 'missed'>;
  activeTimeMs?: number;
}

function blendChannel(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount);
}

function blendRgb(
  start: [number, number, number],
  end: [number, number, number],
  amount: number
): string {
  return `rgb(${blendChannel(start[0], end[0], amount)} ${blendChannel(start[1], end[1], amount)} ${blendChannel(start[2], end[2], amount)})`;
}

function getContourHeatColor(stat?: ContourNoteHeatStat): string {
  if (!stat || stat.sessionCount === 0) {
    return 'rgb(79 70 229)';
  }

  if (stat.missRate <= 0.35) {
    return blendRgb([16, 185, 129], [245, 158, 11], stat.missRate / 0.35);
  }

  return blendRgb([245, 158, 11], [239, 68, 68], (stat.missRate - 0.35) / 0.65);
}

function getContourHeatOpacity(stat?: ContourNoteHeatStat): number {
  if (!stat || stat.sessionCount === 0) {
    return 0.85;
  }

  return Math.min(0.98, 0.62 + Math.min(stat.sessionCount, 10) * 0.03);
}

export function PitchContourThumbnail({ notes = [], segmentDurationMs, className, noteHeatMap, noteResults, activeTimeMs }: PitchContourThumbnailProps) {
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
        <defs>
          <filter id="active-contour-note-glow" x="-100%" y="-200%" width="300%" height="500%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <rect x="0" y="11.5" width="100" height="1" fill="rgb(165 180 252)" />
        {notes.length === 0 ? null : notes.map((note) => {
          const x = Math.max(0, Math.min(100, (note.timeOffsetMs / safeDurationMs) * 100));
          const width = Math.max(1, Math.min(100 - x, (note.durationMs / safeDurationMs) * 100));
          const y = (1 - note.lane) * 20;
          const stat = noteHeatMap?.[note.id];
          const result = noteResults?.[note.id];
          const isActive = activeTimeMs !== undefined
            && activeTimeMs >= note.timeOffsetMs
            && activeTimeMs < note.timeOffsetMs + note.durationMs;

          return (
            <g key={note.id}>
              {isActive ? (
                <rect
                  data-testid="pitch-contour-thumbnail-active-halo"
                  data-active-note-id={note.id}
                  x={x - 1}
                  y={Math.max(0, Math.min(20, y)) - 1}
                  width={width + 2}
                  height={6}
                  rx={3}
                  fill="rgb(250 204 21)"
                  opacity={0.9}
                  filter="url(#active-contour-note-glow)"
                />
              ) : null}
              <rect
                data-testid="pitch-contour-thumbnail-note"
                data-note-heat-rate={stat ? stat.missRate.toFixed(3) : undefined}
                data-note-heat-sessions={stat ? String(stat.sessionCount) : undefined}
                data-note-result={result}
                data-active={isActive ? "true" : undefined}
                x={x}
                y={Math.max(0, Math.min(20, y))}
                width={width}
                height={4}
                rx={1}
                fill={result === 'matched' ? 'rgb(22 163 74)' : result === 'missed' ? 'rgb(220 38 38)' : getContourHeatColor(stat)}
                opacity={result ? 0.95 : isActive ? 1 : getContourHeatOpacity(stat)}
                stroke={isActive ? "rgb(255 255 255)" : undefined}
                strokeWidth={isActive ? 0.8 : undefined}
              >
                {result ? (
                  <title>{result === 'matched' ? 'Correct in the most recent Tap attempt' : 'Missed in the most recent Tap attempt'}</title>
                ) : stat ? (
                  <title>{`${stat.missCount} ${stat.missCount === 1 ? 'miss' : 'misses'} in ${stat.sessionCount} graded ${stat.sessionCount === 1 ? 'attempt' : 'attempts'}`}</title>
                ) : null}
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
