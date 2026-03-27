interface KnowledgeBarProps {
  percent: number;
  label?: string;
}

export default function KnowledgeBar({ percent, label }: KnowledgeBarProps) {
  return (
    <div>
      {label && (
        <p className="text-xs text-gray-500 mb-1">{label}</p>
      )}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full bg-gray-200 rounded h-3"
      >
        <div
          data-testid="knowledge-bar-fill"
          className="bg-indigo-500 rounded h-3 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
