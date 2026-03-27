import { MemoryRating } from '../types/index';
import RatingButton from './RatingButton';

interface RatingBarProps {
  currentRating?: MemoryRating;
  onRate: (rating: MemoryRating) => void;
  disabled?: boolean;
}

const RATINGS: MemoryRating[] = [1, 2, 3, 4, 5];

export default function RatingBar({ currentRating, onRate, disabled }: RatingBarProps) {
  return (
    <div className="flex gap-2">
      {RATINGS.map((r) => (
        <RatingButton
          key={r}
          rating={r}
          selected={currentRating === r}
          onClick={onRate}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
