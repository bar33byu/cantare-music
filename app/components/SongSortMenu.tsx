import {
  SONG_SORT_KEYS,
  SONG_SORT_KEY_LABELS,
  type SongSortKey,
  type SongSortState,
} from "../lib/songSort";

interface SongSortMenuProps {
  sort: SongSortState;
  isOpen: boolean;
  testIdPrefix: string;
  directionLabels: Record<SongSortKey, [string, string]>;
  defaultAscForKey: (key: SongSortKey) => boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSortChange: (sort: SongSortState) => void;
}

export function SongSortMenu({
  sort,
  isOpen,
  testIdPrefix,
  directionLabels,
  defaultAscForKey,
  onOpenChange,
  onSortChange,
}: SongSortMenuProps) {
  return (
    <div className="relative ml-auto">
      <button
        type="button"
        data-testid={`${testIdPrefix}-toggle`}
        onClick={() => onOpenChange(!isOpen)}
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <polyline points="3 6 4 7 6 5" />
          <polyline points="3 12 4 13 6 11" />
          <polyline points="3 18 4 19 6 17" />
        </svg>
        {directionLabels[sort.key][sort.asc ? 1 : 0]}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
          {SONG_SORT_KEYS.map((key) => {
            const isActive = sort.key === key;
            return (
              <button
                key={key}
                type="button"
                data-testid={`${testIdPrefix}-${key}`}
                onClick={() => {
                  onSortChange({
                    key,
                    asc: isActive ? !sort.asc : defaultAscForKey(key),
                  });
                  onOpenChange(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm first:rounded-t-lg last:rounded-b-lg hover:bg-gray-50 ${
                  isActive ? "font-semibold text-blue-600" : "text-gray-700"
                }`}
              >
                {SONG_SORT_KEY_LABELS[key]}
                {isActive && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    {sort.asc
                      ? <polyline points="18 15 12 9 6 15" />
                      : <polyline points="6 9 12 15 18 9" />}
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
