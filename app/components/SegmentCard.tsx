
import { MemoryRating, Segment } from '../types/index';
import { getSegmentKnowledgePercent } from '../lib/knowledgeUtils';
import RatingBar from './RatingBar';
import KnowledgeBar from './KnowledgeBar';

interface SegmentCardProps {
  segment: Segment;
  currentRating?: MemoryRating;
  onRate: (rating: MemoryRating) => void;
  isLocked: boolean;
  onToggleLock: () => void;
}

export default function SegmentCard({
  segment,
  currentRating,
  onRate,
  isLocked,
  onToggleLock,
}: SegmentCardProps) {
  const knowledgePercent = currentRating ? getSegmentKnowledgePercent(currentRating) : 0;
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{segment.label}</h2>
        <button aria-label="Toggle lock" data-testid="lock-toggle" onClick={onToggleLock} className="text-sm px-3 py-1 rounded-full border border-gray-300">
          {isLocked ? 'Locked' : 'Unlocked'}
        </button>
      </div>
      <RatingBar currentRating={currentRating} onRate={onRate} disabled={isLocked} />
      <div className="mt-4">
        <KnowledgeBar percent={knowledgePercent} label="Knowledge" />
      </div>
    </div>
  );
}
