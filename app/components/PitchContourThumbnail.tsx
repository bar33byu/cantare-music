import { ContourNoteHeatStat, PitchContourNote } from '../types';

interface PitchContourThumbnailProps {
  notes?: PitchContourNote[];
  segmentDurationMs: number;
  className?: string;
  noteHeatMap?: Record<string, ContourNoteHeatStat>;
}

const MIN_HEATMAP_SESSION_COUNT = 2;

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
  if (!stat || stat.sessionCount < MIN_HEATMAP_SESSION_COUNT) {
    return 'rgb(79 70 229)';
  }

  if (stat.missRate <= 0.35) {
    return blendRgb([16, 185, 129], [245, 158, 11], stat.missRate / 0.35);
  }

  return blendRgb([245, 158, 11], [239, 68, 68], (stat.missRate - 0.35) / 0.65);
}

function getContourHeatOpacity(stat?: ContourNoteHeatStat): number {
  if (!stat || stat.sessionCount < MIN_HEATMAP_SESSION_COUNT) {
    return 0.85;
  }

  return Math.min(0.98, 0.62 + Math.min(stat.sessionCount, 10) * 0.03);
}

export function PitchContourThumbnail({ notes = [], segmentDurationMs, className, noteHeatMap }: PitchContourThumbnailProps) {
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
          const stat = noteHeatMap?.[note.id];

          return (
            <rect
              key={note.id}
              data-testid="pitch-contour-thumbnail-note"
              data-note-heat-rate={stat ? stat.missRate.toFixed(3) : undefined}
              data-note-heat-sessions={stat ? String(stat.sessionCount) : undefined}
              x={x}
              y={Math.max(0, Math.min(20, y))}
              width={width}
              height={4}
              rx={1}
              fill={getContourHeatColor(stat)}
              opacity={getContourHeatOpacity(stat)}
            />
          );
        })}
      </svg>
    </div>
  );
}
