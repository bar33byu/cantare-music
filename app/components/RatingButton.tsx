import { MemoryRating } from '../types/index';

interface RatingButtonProps {
  rating: MemoryRating;
  selected: boolean;
  onClick: (rating: MemoryRating) => void;
  disabled?: boolean;
}

export default function RatingButton({ rating, selected, onClick, disabled }: RatingButtonProps) {
  return (
    <button
      aria-label={`Rate ${rating}`}
      aria-pressed={selected}
      data-testid={`rating-button-${rating}`}
      onClick={() => onClick(rating)}
      disabled={disabled}
      className={[
        'w-10 h-10 rounded-full text-sm font-semibold transition-colors',
        selected
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-100 text-gray-700',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {rating}
    </button>
  );
}
