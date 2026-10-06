interface TriesBarProps {
  used: number;
  limit: number;
  color: string;
}

export default function TriesBar({ used, limit, color }: TriesBarProps) {
  const pct = Math.min((used / limit) * 100, 100);
  return (
    <div className="w-full min-w-0">
      <div className="flex justify-between items-center gap-1 mb-1 min-w-0">
        <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 tabular-nums shrink-0">
          {used}/{limit}
        </span>
        <span className={`text-[9px] sm:text-[11px] font-bold truncate ${used >= limit ? "text-red-600" : "text-gray-400"}`}>
          {used >= limit ? "Max" : `${limit - used} left`}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
